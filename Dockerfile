# ============================================
# SpotScraper — Python Scraper
# ============================================
FROM python:3.12-alpine AS scraper

WORKDIR /app

# System dependencies for yt-dlp (ffmpeg)
RUN apk add --no-cache ffmpeg curl

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scraper source code
COPY Scraper.py .
COPY spotify_recap.py .

# Create runtime directories
RUN mkdir -p downloads spotify_data

VOLUME ["/app/downloads", "/app/spotify_data"]

# Default: run the main scraper (override with docker-compose command)
ENTRYPOINT ["python"]
CMD ["Scraper.py"]
