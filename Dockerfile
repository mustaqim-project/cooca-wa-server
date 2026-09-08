FROM node:20-slim

# Install build/curl utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set up non-root user with UID 1000 (Required for Hugging Face Spaces & security best practices)
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PORT=7860

WORKDIR $HOME/app

# Copy package manifests and install production dependencies
COPY --chown=user:user package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY --chown=user:user . .

# Ensure storage directories exist with proper write permissions for session auth
RUN mkdir -p .baileys_auth logs && chown -R user:user .baileys_auth logs

# Expose ports (7860 for Hugging Face Spaces, 3000 for standard Docker)
EXPOSE 7860
EXPOSE 3000

# Switch to non-root user
USER user

# Start WhatsApp Gateway
CMD ["npm", "start"]
