# DocRIt Deployment Guide

This guide details the steps required to deploy the **DocRIt** application on your company's production server.

---

## 📋 System Requirements
* **OS**: Linux (Ubuntu 20.04/22.04 LTS or Debian 11/12 recommended)
* **RAM**: 2 GB Minimum (4 GB Recommended for handling large PDFs and parallel OCR tasks)
* **CPU**: 2 Cores Minimum (LibreOffice and PDF parsers are CPU-intensive)
* **Disk Space**: 10 GB available space (base Docker images contain LibreOffice, Java JRE, and Tesseract models)

---

## 🐳 Option 1: Docker Compose Deployment (Recommended)
This is the most reliable deployment method. Docker packages all dependencies (Python, Node.js, Java JRE, Tesseract OCR, Ghostscript, and LibreOffice) inside isolated containers, avoiding any configuration conflicts on your server.

### Step 1: Install Docker & Docker Compose
SSH into your server and run:
```bash
# Update package list
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io

# Enable and start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify Docker version (Docker Compose is included in modern Docker CLI v2+)
docker compose version
```

### Step 2: Clone the Project
Clone the repository from your Git server:
```bash
git clone https://github.com/Ankit-kirodiwal/DocRit.git
cd DocRit
```

### Step 3: Start the Production Build
Run the compose file in the background. This will build both the frontend and backend containers:
```bash
sudo docker compose up --build -d
```
*Note: The first build can take 3 to 5 minutes as it downloads and configures LibreOffice and Tesseract binaries.*

### Step 4: Verify Status
Verify that both containers are running successfully:
```bash
sudo docker compose ps
```
You should see:
* `docrit-backend` running on port `5000`
* `docrit-frontend` running on port `80`

To inspect container logs:
```bash
sudo docker compose logs -f
```

### Step 5: Configure Firewalls
Ensure ports **`80`** (and/or **`443`** if setting up SSL) are open in your cloud firewall (e.g., AWS Security Groups, Azure Network Security Groups, or local `ufw` firewall):
```bash
sudo ufw allow 80/tcp
sudo ufw reload
```

---

## 🛠️ Option 2: Manual Ubuntu VM Deployment (No Docker)
If Docker is not allowed on your server, follow these manual configuration steps:

### Step 1: Install Required Runtime Dependencies
Install Python 3, Pip, Node.js, Java JRE (for table extraction), Tesseract OCR, Ghostscript, and LibreOffice:
```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip default-jre-headless tesseract-ocr ghostscript libreoffice nginx
```

### Step 2: Clone the Code base
```bash
git clone https://github.com/Ankit-kirodiwal/DocRit.git
cd DocRit
```

### Step 3: Configure and Build the Backend
1. Install Node.js libraries:
   ```bash
   cd backend
   npm ci
   ```
2. Install Python packages:
   ```bash
   pip3 install -r requirements.txt
   ```
3. Compile TypeScript files:
   ```bash
   npm run build
   ```
4. Install **PM2** to run the backend as a background service:
   ```bash
   sudo npm install -g pm2
   pm2 start dist/server.js --name "docrit-backend"
   pm2 save
   pm2 startup
   ```

### Step 4: Configure and Serve the Frontend
1. Move to the frontend directory:
   ```bash
   cd ../frontend
   npm ci
   ```
2. Build the production React app:
   ```bash
   npm run build
   ```
3. Copy the compiled files to Nginx's document root:
   ```bash
   sudo cp -r dist/* /var/www/html/
   ```
4. Copy the custom reverse proxy Nginx configuration:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/default
   sudo systemctl restart nginx
   ```

---

## 🔒 Post-Deployment Checklist
1. **SSL Setup (HTTPS)**: If exposing the site publicly, configure **Certbot (Let's Encrypt)** for free SSL certificates:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.company.com
   ```
2. **File Upload Limit**: In case you run into `"Request Entity Too Large"` errors on Nginx when uploading files >50MB, check `/etc/nginx/nginx.conf` and ensure `client_max_body_size 100M;` is configured (our custom `nginx.conf` has this set to 100M already).
3. **Volatile Cleanups**: Temporary files generated during conversions are stored under `/tmp/`. Our software handles cleanup automatically, but a monthly cronjob to remove any orphaned `/tmp/docrit_*` folders is a good practice.
