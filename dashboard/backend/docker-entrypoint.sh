#!/bin/sh
# Initialize empty JSON files if they don't exist
# (prevents crashes on first run)
for f in /download_cache.json /download_links.json /scrape_log.json; do
  if [ ! -f "$f" ]; then
    echo '{}' > "$f"
  fi
done

# Ensure directories exist
mkdir -p /downloads /spotify_data

exec "$@"
