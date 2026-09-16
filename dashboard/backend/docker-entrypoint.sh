#!/bin/sh
# Initialize empty JSON files if they don't exist
# (prevents crashes on first run)
set -eu
DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"
for f in "$DATA_DIR/download_cache.json" "$DATA_DIR/download_links.json" "$DATA_DIR/scrape_log.json"; do
  if [ ! -f "$f" ]; then
    echo '{}' > "$f"
  fi
done

# Ensure directories exist
mkdir -p /app/downloads /app/spotify_data /app/apple_music_data

exec "$@"
