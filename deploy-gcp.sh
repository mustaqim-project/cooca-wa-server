#!/usr/bin/env bash
# ==============================================================================
# COOCA WhatsApp Gateway - Google Cloud Free VPS (e2-micro) Setup Script
# Architecture: Ubuntu 22.04 / 24.04 LTS on Google Cloud Free Tier
# ==============================================================================

set -e

echo "=========================================================="
echo " Starting COOCA WhatsApp Gateway Setup on Google Cloud VPS "
echo "=========================================================="

# 1. OPTIMIZATION FOR 1GB RAM: Create 2GB Swapfile (Prevents OOM Crashes)
if [ ! -f /swapfile ]; then
    echo "[1/6] Creating 2GB Swapfile for 1GB RAM safety..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    sudo sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo "✓ Swapfile 2GB successfully created and activated."
else
    echo "[1/6] Swapfile already exists, skipping."
fi

# 2. Update System Packages
echo "[2/6] Updating OS package lists..."
sudo apt-get update -y
sudo apt-get install -y curl git ufw build-essential

# 3. Install Node.js 20 LTS & npm
if ! command -v node &> /dev/null; then
    echo "[3/6] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✓ Node.js installed: $(node -v)"
else
    echo "[3/6] Node.js already installed: $(node -v)"
fi

# 4. Install PM2 Globally
if ! command -v pm2 &> /dev/null; then
    echo "[4/6] Installing PM2 Process Manager..."
    sudo npm install -g pm2
    echo "✓ PM2 installed."
else
    echo "[4/6] PM2 already installed."
fi

# 5. Project Directory & Dependencies
echo "[5/6] Installing project dependencies..."
mkdir -p logs
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Created .env from .env.example. Please review settings in .env."
    fi
fi

npm install --omit=dev

# 6. PM2 Startup & Launch
echo "[6/6] Starting WhatsApp Gateway with PM2..."
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

echo "=========================================================="
echo " COOCA WhatsApp Gateway is RUNNING on port 3000! "
echo "=========================================================="
echo "Useful Commands:"
echo "  pm2 status             -> Cek status service"
echo "  pm2 logs cooca-wa-server -> Lihat real-time log / QR code"
echo "  pm2 restart cooca-wa-server -> Restart gateway"
echo "=========================================================="
