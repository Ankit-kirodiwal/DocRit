# IIS Deployment Guide for DocRIt (Local Windows Testing)

This guide provides step-by-step instructions to deploy and host the **DocRIt** application on **IIS (Internet Information Services)** on Windows. 

By following this setup, the frontend will be served directly by IIS, and the backend Node.js server will run automatically in the background as a Windows Service, with IIS proxying API requests to it. You will **not** have to manually run `node dist/server.js` every time.

---

## 📋 Prerequisites

Before starting, ensure the following components are installed on your Windows machine:

1. **IIS (Internet Information Services)**:
   - Open **Turn Windows features on or off** in Control Panel.
   - Check **Internet Information Services**.
   - Expand **World Wide Web Services** > **Common HTTP Features** and ensure **Default Document**, **Directory Browsing**, **HTTP Errors**, and **Static Content** are checked.
   - Click **OK** to install.

2. **IIS URL Rewrite Module**:
   - [Download and install the URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite). (Required for React routing and proxying).

3. **Application Request Routing (ARR) 3.0**:
   - [Download and install ARR 3.0](https://www.iis.net/downloads/microsoft/application-request-routing). (Required for reverse proxying requests to the Node backend).

4. **Node.js & npm**:
   - Ensure Node.js (v18+) is installed. Run `node -v` in PowerShell/CMD to verify.

---

## ⚙️ Step 1: Enable Proxying in IIS (Critical)

After installing ARR, you must explicitly enable proxying, or IIS will return `404` or `502` errors for backend API requests.

1. Open **IIS Manager** (type `inetmgr` in Windows Search or Run).
2. In the left-hand **Connections** panel, click on your server name (root node).
3. In the center pane, double-click **Application Request Routing Cache**.
4. In the right-hand **Actions** pane, click **Server Proxy Settings...**.
5. Check the box **Enable proxy**.
6. Click **Apply** in the right-hand pane.

---

## 🛠️ Step 2: Build the Frontend & Backend

Open a PowerShell or Command Prompt window and execute the following commands:

### 1. Build the Backend
```cmd
cd C:\Users\ankit\doc\DocRit\backend
npm install
npm run build
```
*This compiles TypeScript files into the `dist/` directory.*

### 2. Build the Frontend
```cmd
cd C:\Users\ankit\doc\DocRit\frontend
npm install
npm run build
```
*This compiles the React app and automatically copies the configured `web.config` file into `C:\Users\ankit\doc\DocRit\frontend\dist`.*

---

## 🚀 Step 3: Configure Backend to Run Automatically

To avoid running `node dist/server.js` manually, you can set it up as a background service. Choose **one** of the two options below:

### Option A: Run as a Service using PM2 (Recommended & Simple)
PM2 is a production process manager for Node.js.

1. Install PM2 globally:
   ```cmd
   npm install -g pm2
   ```
2. Start the backend with PM2 from the backend folder:
   ```cmd
   cd C:\Users\ankit\doc\DocRit\backend
   pm2 start dist/server.js --name "docrit-backend"
   ```
3. To make PM2 start automatically on Windows boot, install `pm2-windows-startup`:
   ```cmd
   npm install -g pm2-windows-startup
   pm2-startup install
   pm2 save
   ```

### Option B: Run as a Windows Service using NSSM (Highly Reliable)
NSSM (Non-Sucking Service Manager) is a tool that wraps any script/executable as a native Windows service.

1. Download NSSM from [nssm.cc/download](https://nssm.cc/download) and extract the `.exe` (from the `win64` folder) to a folder (e.g., `C:\nssm\`).
2. Open PowerShell/CMD as **Administrator** and run:
   ```cmd
   C:\nssm\nssm.exe install docrit-backend
   ```
3. A GUI window will open. Configure the fields as follows:
   - **Path**: `C:\Program Files\nodejs\node.exe` (or the path to your `node.exe`)
   - **Startup directory**: `C:\Users\ankit\doc\DocRit\backend`
   - **Arguments**: `dist/server.js`
4. Go to the **Environment** tab and add the port environment variable (optional):
   ```
   PORT=5000
   ```
5. Click **Install service**.
6. Start the service:
   ```cmd
   net start docrit-backend
   ```

---

## 🌐 Step 4: Host on IIS

Now, create the website in IIS that serves the frontend files and reverse-proxies the backend requests.

1. Open **IIS Manager**.
2. Right-click on **Sites** in the left panel and select **Add Website...**.
3. Configure the following:
   - **Site name**: `DocRit`
   - **Physical path**: `C:\Users\ankit\doc\DocRit\frontend\dist`
   - **Port**: Choose an open port (e.g., `80` to access via `http://localhost`, or `8080` if port 80 is occupied).
4. Click **OK**.

### Set Permissions
To ensure IIS has permissions to read your files:
1. In Windows Explorer, right-click `C:\Users\ankit\doc\DocRit\frontend\dist` and click **Properties**.
2. Go to the **Security** tab and click **Edit...**.
3. Click **Add...**, type `IIS_IUSRS`, and click **OK**.
4. Check **Read & execute**, **List folder contents**, and **Read** permissions.
5. Click **Apply and OK**.

---

## 🧪 Step 5: Test the Application

1. Open your browser and navigate to:
   - `http://localhost` (or `http://localhost:8080` if you used port 8080).
2. Test the connection:
   - Navigate to `http://localhost/health` (or `http://localhost:8080/health`). You should see:
     ```json
     {"status":"ok","timestamp":"..."}
     ```
   - This verifies that IIS successfully proxies traffic to your running Node.js service on port `5000`.

---

## 🛠️ Troubleshooting & Commands

### PM2 Commands
- **View Status**: `pm2 status`
- **View Logs**: `pm2 logs docrit-backend`
- **Restart Backend**: `pm2 restart docrit-backend`
- **Stop Backend**: `pm2 stop docrit-backend`

### IIS Log files
If you encounter `502.3 Bad Gateway` or rewrite issues:
- Check that the backend service is running on port 5000: `curl http://localhost:5000/health`.
- Confirm **Enable proxy** is checked in IIS ARR Cache settings.
- Verify `web.config` exists inside `C:\Users\ankit\doc\DocRit\frontend\dist`.
