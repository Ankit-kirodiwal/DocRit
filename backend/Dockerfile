# Use Node LTS base image (Debian Bullseye)
FROM node:18-bullseye

# Install system dependencies: Python3, Java (for tabula-py), Tesseract, Ghostscript, LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    default-jre-headless \
    tesseract-ocr \
    tesseract-ocr-eng \
    ghostscript \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-common \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy package files and install backend dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the backend files
COPY . .

# Install Python requirements
RUN pip3 install --no-cache-dir -r requirements.txt

# Build the TypeScript code
RUN npm run build

# Expose port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Run the backend server
CMD ["node", "dist/server.js"]
