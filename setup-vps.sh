#!/usr/bin/env bash
# ==============================================================================
# COOCA WhatsApp Gateway - Universal Linux VPS Setup Script
# Works on Ubuntu 20.04 / 22.04 / 24.04 & Debian 11 / 12
# Compatible with DigitalOcean, Linode, Azure, AWS, GCP, GitHub Codespaces, etc.
# ==============================================================================

set -e

echo "=========================================================="
echo "   COOCA WhatsApp Gateway - Universal VPS Installer       "
echo "=========================================================="

# 1. Memory Optimization: Create 2GB Swapfile if total RAM < 2GB
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_RAM_KB" -lt 2000000 ] && [ ! -f /swapfile ]; then
    echo "[1/5] RAM < 2GB detected. Creating 2GB Swapfile for memory safety..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    sudo sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo "✓ 2GB Swapfile activated."
else
    echo "[1/5] Sufficient RAM or Swapfile already exists. Skipping."
fi

# 2. Update System Packages
echo "[2/5] Updating package repository..."
sudo apt-get update -y
sudo apt-get install -y curl git ufw build-essential

# 3. Install Node.js 20 LTS & npm
if ! command -v node &> /dev/null; then
    echo "[3/5] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✓ Node.js installed: $(node -v)"
else
    echo "[3/5] Node.js is already installed: $(node -v)"
fi

# 4. Install PM2 Globally
if ! command -v pm2 &> /dev/null; then
    echo "[4/5] Installing PM2..."
    sudo npm install -g pm2
    echo "✓ PM2 installed."
else
    echo "[4/5] PM2 is already installed."
fi

# 5. Project Dependencies & PM2 Launch
echo "[5/5] Setting up COOCA WhatsApp Gateway..."
mkdir -p logs
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Created .env file from .env.example."
    fi
fi

npm install --omit=dev

# Start / Restart with PM2
pm2 start ecosystem.config.js || pm2 restart cooca-wa-server
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

echo "=========================================================="
echo " COOCA WhatsApp Gateway is RUNNING on Port 3000! "
echo "=========================================================="
echo "Helpful Commands:"
echo "  pm2 status                 -> Cek status proses"
echo "  pm2 logs cooca-wa-server   -> Lihat log & QR code live"
echo "  pm2 restart cooca-wa-server -> Restart gateway"
echo "=========================================================="
