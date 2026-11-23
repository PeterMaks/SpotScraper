FROM node:22-bookworm-slim

WORKDIR /app

# Upgrade system packages and install dependencies
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

# Create virtual environment so Node server finds it at .venv/bin/python
RUN python3 -m venv .venv

# Install Python dependencies
COPY requirements.txt ./
RUN .venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy Python scraper scripts
COPY *.py ./

# Install Node dependencies
COPY dashboard/backend/package.json dashboard/backend/package-lock.json ./dashboard/backend/
RUN cd dashboard/backend && npm ci --omit=dev

# Copy backend source
COPY dashboard/backend/*.js ./dashboard/backend/

# Copy and prepare entrypoint
COPY dashboard/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create logs directory
RUN mkdir -p dashboard/backend/logs /app/data /app/downloads /app/spotify_data /app/apple_music_data && chown -R node:node /app
ENV DATA_DIR=/app/data
USER node

EXPOSE 3001

# The Node app runs inside /app/dashboard/backend
WORKDIR /app/dashboard/backend

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
