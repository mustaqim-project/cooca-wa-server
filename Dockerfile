FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules if needed
RUN apk add --no-cache python3 make g++

# Copy package manifests first for efficient caching
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose port
ENV PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["npm", "start"]
