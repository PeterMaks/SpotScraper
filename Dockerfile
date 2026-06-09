# ============================================
# SpotScraper — Python Scraper
# ============================================
FROM python:3.12-slim AS scraper

WORKDIR /app

# System dependencies for yt-dlp (ffmpeg) and Playwright browsers
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scraper source code
COPY Scraper.py .
COPY qobuz_scrapper.py .
COPY spotify_recap.py .

# Create runtime directories
RUN mkdir -p downloads spotify_data

VOLUME ["/app/downloads", "/app/spotify_data"]

# Default: run the main scraper (override with docker-compose command)
ENTRYPOINT ["python"]
CMD ["Scraper.py"]
