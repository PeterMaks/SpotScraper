FROM node:24

WORKDIR /app

# Install Python, venv, ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ffmpeg curl && rm -rf /var/lib/apt/lists/*

# Create virtual environment so Node server finds it at .venv/bin/python
RUN python3 -m venv .venv

# Install Python dependencies
COPY requirements.txt ./
RUN .venv/bin/pip install --no-cache-dir -r requirements.txt
RUN .venv/bin/playwright install --with-deps chromium

# Copy Python scraper scripts
COPY *.py ./

# Install Node dependencies
COPY dashboard/backend/package.json dashboard/backend/package-lock.json ./dashboard/backend/
RUN cd dashboard/backend && npm ci --omit=dev

# Copy backend source
COPY dashboard/backend/server.js dashboard/backend/parser.js dashboard/backend/logger.js ./dashboard/backend/

# Copy and prepare entrypoint
COPY dashboard/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create logs directory
RUN mkdir -p dashboard/backend/logs

EXPOSE 3001

# The Node app runs inside /app/dashboard/backend
WORKDIR /app/dashboard/backend

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
