# IIS Deployment Guide for DocRIt

This guide provides step-by-step instructions for deploying the **DocRIt** application (React frontend and Node.js/Python backend) on **IIS (Internet Information Services)** on Windows Server.

---

## 1. Prerequisites Setup

Before configuring IIS, install the following system dependencies on the Windows Server host:

### A. Windows Server / IIS Roles
1. Open **Server Manager** -> **Add Roles and Features**.
2. Install **Web Server (IIS)**.
3. Under **Application Development**, ensure the following are installed:
   *   `CGI`
   *   `WebSocket Protocol`
   *   `.NET Extensibility` and `ASP.NET`

### B. IIS Modules (Critical)
*   **URL Rewrite Module 2.1**: Download and install from [IIS URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite).
*   **Application Request Routing (ARR) 3.0**: Download and install from [Application Request Routing](https://www.iis.net/downloads/microsoft/application-request-routing).

### C. Backend & Processor Runtimes
1. **Node.js (LTS)**: Download and install the Windows installer (.msi) from [Node.js](https://nodejs.org/). Verify `node -v` and `npm -v` run in PowerShell.
2. **Python 3.10+**: Download from [Python.org](https://www.python.org/).
   *   *Important:* Check the box **"Add Python to PATH"** during installation.
   *   *Important:* Check the box **"Install for all users"** under advanced options so the IIS AppPool user can access Python.
3. **Java Runtime Environment (JRE)**: Install JRE (64-bit) for Excel table extraction (`tabula-py`). Add the `java` path to the system environment variables.
4. **Tesseract OCR**: Download and install the Windows binaries (e.g., from UB Mannheim).
   *   Default path should be `C:\Program Files\Tesseract-OCR\tesseract.exe`.
5. **LibreOffice**: Download and install LibreOffice for Windows.
   *   Default path should be `C:\Program Files\LibreOffice\program\soffice.exe`.
6. **Ghostscript**: Download and install Ghostscript for Windows. Add its `bin` directory to the system PATH.

---

## 2. Configure Application Request Routing (ARR) Proxy

IIS must be configured to act as a reverse proxy to forward `/api` requests to the Node.js service running on port 5000.

1. Open **IIS Manager**.
2. Click on the **Server Name** in the left-hand Connections pane.
3. In the center pane, double-click **Application Request Routing Cache**.
4. In the right-hand Actions pane, click **Server Proxy Settings...**.
5. Check the box **Enable proxy**.
6. Leave other settings as default and click **Apply** in the actions pane.

---

## 3. Prepare Frontend Build & Deploy

1. In PowerShell, navigate to the `frontend` folder:
   ```powershell
   cd d:\codes\DocRIt\frontend
   npm ci
   npm run build
   ```
2. The production assets will be generated in `frontend/dist/`.
3. In IIS Manager, create a new Website:
   *   **Site name**: `DocRIt-Frontend`
   *   **Physical path**: `d:\codes\DocRIt\frontend\dist`
   *   **Binding**: Choose your HTTP/HTTPS ports and hostnames.
4. Ensure the `web.config` file resides in the root of the physical path (`frontend/dist/web.config`). It handles React SPA routing and redirects API requests:
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <!-- 1. Proxy API requests to backend Node.js server running on port 5000 -->
           <rule name="Reverse Proxy to Backend" stopProcessing="true">
             <match url="^api/(.*)" />
             <action type="Rewrite" url="http://localhost:5000/api/{R:1}" />
           </rule>
           <!-- 2. React SPA routing: Rewrite all other requests to index.html if not a physical file/folder -->
           <rule name="React SPA Routing" stopProcessing="true">
             <match url=".*" />
             <conditions logicalGrouping="MatchAll">
               <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
               <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
             </conditions>
             <action type="Rewrite" url="index.html" />
           </rule>
         </rules>
       </rewrite>
       <staticContent>
         <!-- Ensure web asset types are served correctly by IIS -->
         <remove fileExtension=".json" />
         <mimeMap fileExtension=".json" mimeType="application/json" />
         <remove fileExtension=".woff" />
         <mimeMap fileExtension=".woff" mimeType="font/woff" />
         <remove fileExtension=".woff2" />
         <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
         <remove fileExtension=".webp" />
         <mimeMap fileExtension=".webp" mimeType="image/webp" />
         <remove fileExtension=".svg" />
         <mimeMap fileExtension=".svg" mimeType="image/svg+xml" />
       </staticContent>
     </system.webServer>
   </configuration>
   ```

---

## 4. Prepare Backend & Install Dependencies

1. In PowerShell, navigate to the `backend` folder:
   ```powershell
   cd d:\codes\DocRIt\backend
   npm ci
   npm run build
   ```
2. Install Python dependencies:
   ```powershell
   pip install --no-cache-dir -r requirements.txt
   ```
3. Test running the backend server manually to verify there are no missing dependencies:
   ```powershell
   node dist/server.js
   ```
   *(Ensure it outputs "Server is running on port 5000")*

---

## 5. Host the Backend as a Windows Service

To ensure the backend runs continuously in the background and restarts automatically on server reboot, run it as a Windows Service using **NSSM (Non-Sucking Service Manager)**:

1. Download NSSM from [nssm.cc](https://nssm.cc/) and extract the executable.
2. Open PowerShell as Administrator and execute:
   ```powershell
   nssm install DocRIt-Backend
   ```
3. A GUI window will open. Configure it as follows:
   *   **Path**: Path to `node.exe` (e.g., `C:\Program Files\nodejs\node.exe`)
   *   **Startup directory**: `d:\codes\DocRIt\backend`
   *   **Arguments**: `dist/server.js`
   *   **Environment tab** (Optional): Set environment variables like `PORT=5000` or `NODE_ENV=production`.
4. Click **Install service**.
5. Start the service:
   ```powershell
   Start-Service DocRIt-Backend
   ```

---

## 6. Permissions and Troubleshooting

*   **Temporary File Permissions**:
    The backend uses system temporary directories (or local upload directories) to store incoming PDFs and perform conversions. Ensure the **IIS Application Pool Identity** (e.g., `IIS_IUSRS` or `IIS AppPool\DocRIt-Frontend`) and the user running the Windows Service (`DocRIt-Backend`) have full **Read/Write/Modify** permissions to:
    *   `d:\codes\DocRIt\backend`
    *   Windows Temp directories (`C:\Windows\Temp` and `C:\Users\<ServiceUser>\AppData\Local\Temp`)
*   **PATH Environment Variables**:
    Since the backend spawns processes like `soffice.exe` and `tesseract.exe`, ensure the user context running `DocRIt-Backend` has these programs in its PATH environment variable. If they are not found, confirm they are installed in their default locations (where the code automatically looks for them: `C:\Program Files\LibreOffice\program\soffice.exe` and `C:\Program Files\Tesseract-OCR\tesseract.exe`).
