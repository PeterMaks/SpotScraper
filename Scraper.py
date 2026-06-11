import json
import os
import time
from datetime import datetime
import urllib.parse
import csv
import yt_dlp
import unicodedata
import sys
import io
import difflib

# Force UTF-8 encoding for standard output and error to avoid Windows terminal encoding crashes
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import logging
from pythonjsonlogger import jsonlogger

log_handler = logging.FileHandler('scrape_audit.log')
formatter = jsonlogger.JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s')
log_handler.setFormatter(formatter)
logger = logging.getLogger('scraper')
logger.setLevel(logging.INFO)
logger.addHandler(log_handler)

CACHE_FILE = 'download_cache.json'

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache_dict):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_dict, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving cache: {e}")

def emit_log(log_type, key, data):
    import urllib.request
    import json
    
    if isinstance(data, dict):
        data['source'] = 'api'
    
    url = "http://localhost:3001/api/internal/log"
    payload = json.dumps({
        "type": log_type,
        "key": key,
        "data": data
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=2)
    except Exception as e:
        print(f"Error emitting log: {e}")

def build_dir_cache(downloads_dir="downloads"):
    dir_cache = {}
    if not os.path.exists(downloads_dir):
        return dir_cache
    for root, dirs, files in os.walk(downloads_dir):
        for file in files:
            if file.endswith('.mp3'):
                filename_no_ext = os.path.splitext(file)[0]
                clean_filename = "".join(c for c in filename_no_ext if c.isalnum()).lower()
                dir_cache[clean_filename] = os.path.join(root, file)
    return dir_cache

def parse_excel_file(filepath):
    """
    Parses Excel (.xlsx / .xls) files and extracts query and playlist.
    """
    tracks = []
    import openpyxl
    try:
        wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
        sheet = wb.active
        
        # Read rows
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return tracks
            
        # Check if first row has headers
        first_row = [str(cell).strip().lower() if cell is not None else "" for cell in rows[0]]
        
        track_idx, artist_idx, playlist_idx, uri_idx = -1, -1, -1, -1
        album_idx, duration_idx, release_date_idx = -1, -1, -1
        for idx, val in enumerate(first_row):
            if val in ('track', 'song', 'title', 'name', 'track name', 'song name'):
                track_idx = idx
            elif val in ('artist', 'singer', 'band', 'artist name', 'artist name(s)', 'artists'):
                artist_idx = idx
            elif val in ('playlist', 'folder', 'category', 'playlist name'):
                playlist_idx = idx
            elif val in ('uri', 'track uri', 'id', 'spotify uri'):
                uri_idx = idx
            elif val in ('album', 'album name'):
                album_idx = idx
            elif val in ('duration', 'duration (ms)', 'duration_ms', 'ms'):
                duration_idx = idx
            elif val in ('release date', 'release_date', 'released'):
                release_date_idx = idx
                
        has_headers = (track_idx != -1 or artist_idx != -1)
        
        start_row = 1 if has_headers else 0
        for row in rows[start_row:]:
            if not row:
                continue
            if has_headers:
                track = str(row[track_idx]).strip() if track_idx != -1 and track_idx < len(row) and row[track_idx] is not None else ""
                artist = str(row[artist_idx]).strip() if artist_idx != -1 and artist_idx < len(row) and row[artist_idx] is not None else ""
                playlist = str(row[playlist_idx]).strip() if playlist_idx != -1 and playlist_idx < len(row) and row[playlist_idx] is not None else ""
                uri = str(row[uri_idx]).strip() if uri_idx != -1 and uri_idx < len(row) and row[uri_idx] is not None else ""
                album = str(row[album_idx]).strip() if album_idx != -1 and album_idx < len(row) and row[album_idx] is not None else ""
                release_date = str(row[release_date_idx]).strip() if release_date_idx != -1 and release_date_idx < len(row) and row[release_date_idx] is not None else ""
                
                duration_ms = 0
                if duration_idx != -1 and duration_idx < len(row) and row[duration_idx] is not None:
                    try:
                        duration_ms = int(row[duration_idx])
                    except ValueError:
                        pass
                
                duration_str = "-"
                if duration_ms > 0:
                    secs = duration_ms // 1000
                    m = secs // 60
                    s = secs % 60
                    duration_str = f"{m}m {s}s"
                
                if track:
                    query = f"{track} {artist}".strip()
                    if not uri:
                        import hashlib
                        uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({
                        "id": uri,
                        "query": query,
                        "track": track,
                        "artist": artist,
                        "playlist": playlist,
                        "album": album,
                        "duration": duration_str,
                        "release_date": release_date
                    })
            else:
                # No header: treat first cell as query, second as optional playlist
                cells = [str(c).strip() if c is not None else "" for c in row]
                if len(cells) >= 2:
                    track = cells[0]
                    artist = cells[1]
                    playlist = cells[2] if len(cells) > 2 else ""
                    query = f"{track} {artist}".strip()
                    import hashlib
                    uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist, "release_date": ""})
                elif len(cells) == 1 and cells[0]:
                    track = cells[0]
                    query = track
                    import hashlib
                    uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({"id": uri, "query": query, "track": track, "artist": "", "playlist": "", "release_date": ""})
    except Exception as e:
        print(f"Error parsing Excel file {filepath}: {e}")
    return tracks

def parse_spotify_data(json_directory, specific_file=None):
    """
    Parses Spotify streaming history, playlists, custom CSV files, and Excel sheets.
    Returns a list of unique dicts: [{"query": "track artist", "playlist": "playlist_name"}]
    """
    # 1. Parse Playlists first to build a mapping from (track, artist) -> playlist_name
    track_to_playlist = {} # maps (track.lower(), artist.lower()) -> playlist_name
    
    if os.path.exists(json_directory):
        for filename in os.listdir(json_directory):
            # Check for playlist files exported from Spotify (e.g. Playlist1.json, Playlists.json)
            if filename.endswith(".json") and "playlist" in filename.lower():
                filepath = os.path.join(json_directory, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
                        # Handle both direct array and wrapped dictionary
                        playlists = data if isinstance(data, list) else data.get("playlists", [])
                        for playlist in playlists:
                            playlist_name = playlist.get("name", "Unknown Playlist")
                            items = playlist.get("items", [])
                            for item in items:
                                track_info = item.get("track")
                                if track_info:
                                    t_name = track_info.get("trackName")
                                    a_name = track_info.get("artistName")
                                    if t_name and a_name:
                                        track_to_playlist[(t_name.lower().strip(), a_name.lower().strip())] = playlist_name
                    except Exception as e:
                        print(f"Error parsing playlist file {filename}: {e}")

    # 2. Parse streams, custom CSVs and Excel docs
    download_items = [] # list of {"query": "...", "playlist": "..."}
    seen_queries = set()
    
    if os.path.exists(json_directory):
        files_to_process = [specific_file] if specific_file else os.listdir(json_directory)
        for filename in files_to_process:
            if not filename:
                continue
            filepath = os.path.join(json_directory, filename)
            if not os.path.exists(filepath):
                print(f"File not found: {filepath}")
                continue
            
            # A. Parse CSV files
            if filename.endswith(".csv"):
                print(f"Parsing custom CSV file: {filename}")
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        # Try to sniff headers
                        sample = f.read(2048)
                        f.seek(0)
                        has_header = False
                        try:
                            has_header = csv.Sniffer().has_header(sample)
                        except Exception:  # nosec B110 - Sniffer throws if header/delimiter is undetectable; fallback is safe
                            pass
                        
                        reader = csv.reader(f)
                        if has_header:
                            headers = [h.strip().lower() for h in next(reader)]
                            track_idx, artist_idx, playlist_idx, uri_idx = -1, -1, -1, -1
                            album_idx, duration_idx, release_date_idx = -1, -1, -1
                            for idx, h in enumerate(headers):
                                if h in ('track', 'song', 'title', 'name', 'track name', 'song name'):
                                    track_idx = idx
                                elif h in ('artist', 'singer', 'band', 'artist name', 'artist name(s)', 'artists'):
                                    artist_idx = idx
                                elif h in ('playlist', 'folder', 'category', 'playlist name'):
                                    playlist_idx = idx
                                elif h in ('uri', 'track uri', 'id', 'spotify uri'):
                                    uri_idx = idx
                                elif h in ('album', 'album name'):
                                    album_idx = idx
                                elif h in ('duration', 'duration (ms)', 'duration_ms', 'ms'):
                                    duration_idx = idx
                                elif h in ('release date', 'release_date', 'released'):
                                    release_date_idx = idx
                            
                            for row in reader:
                                if not row:
                                    continue
                                track = row[track_idx].strip() if track_idx != -1 and track_idx < len(row) else ""
                                artist = row[artist_idx].strip() if artist_idx != -1 and artist_idx < len(row) else ""
                                playlist = row[playlist_idx].strip() if playlist_idx != -1 and playlist_idx < len(row) else ""
                                uri = row[uri_idx].strip() if uri_idx != -1 and uri_idx < len(row) else ""
                                album = row[album_idx].strip() if album_idx != -1 and album_idx < len(row) else ""
                                release_date = row[release_date_idx].strip() if release_date_idx != -1 and release_date_idx < len(row) else ""
                                
                                duration_ms = 0
                                if duration_idx != -1 and duration_idx < len(row):
                                    try:
                                        duration_ms = int(row[duration_idx])
                                    except ValueError:
                                        pass
                                
                                duration_str = "-"
                                if duration_ms > 0:
                                    secs = duration_ms // 1000
                                    m = secs // 60
                                    s = secs % 60
                                    duration_str = f"{m}m {s}s"
                                
                                if track:
                                    query = f"{track} {artist}".strip()
                                    if query not in seen_queries:
                                        seen_queries.add(query)
                                        if not uri:
                                            import hashlib
                                            uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({
                                            "id": uri,
                                            "query": query,
                                            "track": track,
                                            "artist": artist,
                                            "playlist": playlist,
                                            "album": album,
                                            "duration": duration_str,
                                            "release_date": release_date
                                        })
                        else:
                            for row in reader:
                                if not row:
                                    continue
                                if len(row) >= 2:
                                    track = row[0].strip()
                                    artist = row[1].strip()
                                    playlist = row[2].strip() if len(row) > 2 else ""
                                    query = f"{track} {artist}".strip()
                                    if query not in seen_queries:
                                        seen_queries.add(query)
                                        import hashlib
                                        uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist, "release_date": ""})
                                elif len(row) == 1:
                                    track = row[0].strip()
                                    query = track
                                    if query not in seen_queries:
                                        seen_queries.add(query)
                                        import hashlib
                                        uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({"id": uri, "query": query, "track": track, "artist": "", "playlist": "", "release_date": ""})
                except Exception as e:
                    print(f"Error parsing CSV file {filename}: {e}")
            
            # B. Parse Excel files (.xlsx / .xls)
            elif filename.endswith(".xlsx") or filename.endswith(".xls"):
                filepath = os.path.join(json_directory, filename)
                excel_tracks = parse_excel_file(filepath)
                for t in excel_tracks:
                    query = t["query"]
                    playlist = t["playlist"]
                    uri = t.get("id", "")
                    if query not in seen_queries:
                        seen_queries.add(query)
                        download_items.append({
                            "id": uri,
                            "query": query,
                            "track": t.get("track", ""),
                            "artist": t.get("artist", ""),
                            "playlist": playlist,
                            "album": t.get("album", ""),
                            "duration": t.get("duration", "-"),
                            "release_date": t.get("release_date", "")
                        })
                    
            # B. Parse Spotify Streaming History files (excluding playlist JSONs)
            elif filename.endswith(".json") and "playlist" not in filename.lower():
                with open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError:
                        continue
                    
                    for stream in data:
                        track = stream.get("master_metadata_track_name")
                        artist = stream.get("master_metadata_album_artist_name")
                        album = stream.get("master_metadata_album_album_name")
                        ms = stream.get("ms_played", 0)
                        episode = stream.get("episode_name")
                        show = stream.get("episode_show_name")
                        
                        if track and artist:
                            query = f"{track} {artist}"
                            if query not in seen_queries:
                                seen_queries.add(query)
                                playlist_name = track_to_playlist.get((track.lower().strip(), artist.lower().strip()), "")
                                import hashlib
                                uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                                
                                duration_str = "-"
                                if ms > 0:
                                    secs = ms // 1000
                                    m = secs // 60
                                    s = secs % 60
                                    duration_str = f"{m}m {s}s"
                                
                                download_items.append({
                                    "id": uri,
                                    "query": query,
                                    "track": track,
                                    "artist": artist,
                                    "playlist": playlist_name,
                                    "album": album if album else "",
                                    "duration": duration_str,
                                    "release_date": ""
                                })
                        elif episode and show:
                            query = f"{episode} {show}"
                            if query not in seen_queries:
                                seen_queries.add(query)
                                import hashlib
                                uri = "local:" + hashlib.sha256(query.encode('utf-8')).hexdigest()[:12]
                                download_items.append({"id": uri, "query": query, "track": episode, "artist": show, "playlist": "Podcasts", "release_date": ""})
                                
    return download_items

def check_already_downloaded(query, dir_cache, item_dict=None):
    """
    Checks if the track (query) has already been downloaded using the pre-built directory cache.
    """
    if not query:
        return None
        
    track = item_dict.get("track", "") if item_dict else ""
    artist = item_dict.get("artist", "") if item_dict else ""
    
    if not track:
        track = query
        
    def get_clean_alphanumeric(text):
        if not text:
            return ""
        text = unicodedata.normalize('NFKD', text)
        return "".join(c for c in text if c.isalnum()).lower()

    def get_tokens(text):
        if not text:
            return set()
        text = unicodedata.normalize('NFKD', text)
        for char in "'`’":
            text = text.replace(char, '')
        for char in "-_+=/\\|()[]{}?.,!;:\":~@#$%^&*~？。，、":
            text = text.replace(char, ' ')
        return set(w.lower() for w in text.split() if w.isalnum())

    clean_track = get_clean_alphanumeric(track)
    clean_query = get_clean_alphanumeric(query)
    clean_artist = get_clean_alphanumeric(artist)

    for clean_filename, filepath in dir_cache.items():
        filename_no_ext = os.path.splitext(os.path.basename(filepath))[0]
        
        # 1. Exact case-insensitive match
        if track.lower().strip() == filename_no_ext.lower().strip():
            return filepath
            
        # 2. Exact alphanumeric match of Track
        if clean_track and clean_track == clean_filename:
            return filepath
            
        # 3. Exact alphanumeric match of Query
        if clean_query and clean_query == clean_filename:
            return filepath
            
        # 4. Token-based containment (requires all track words AND all artist words)
        if clean_track and clean_artist:
            track_tokens = get_tokens(track)
            artist_tokens = get_tokens(artist)
            file_tokens = get_tokens(filename_no_ext)
            
            if track_tokens and artist_tokens:
                if track_tokens.issubset(file_tokens) and artist_tokens.issubset(file_tokens):
                    return filepath

    return None

def normalize_text(text):
    if not text:
        return ""
    nfkd_form = unicodedata.normalize('NFKD', text)
    return "".join(c for c in nfkd_form if c.isalnum()).lower()

def is_artist_match(target_artist, title, uploader, channel=None):
    if not target_artist:
        return True
    
    norm_artist = normalize_text(target_artist)
    if not norm_artist:
        return True
        
    norm_title = normalize_text(title)
    norm_uploader = normalize_text(uploader)
    norm_channel = normalize_text(channel) if channel else ""
    
    # 1. Full normalized artist containment check
    if norm_artist in norm_title or norm_artist in norm_uploader or norm_artist in norm_channel:
        return True
        
    # 2. Strip "the" prefix if present
    lower_artist = target_artist.lower().strip()
    if lower_artist.startswith("the "):
        norm_artist_no_the = normalize_text(lower_artist[4:])
        if norm_artist_no_the and (norm_artist_no_the in norm_title or norm_artist_no_the in norm_uploader or norm_artist_no_the in norm_channel):
            return True
            
    # 3. Word-by-word matching for multi-word artists
    words = [w for w in lower_artist.split() if w not in ('the', 'and', 'feat', '&', 'official', 'music', 'video')]
    if words:
        all_words_match = True
        for w in words:
            clean_w = normalize_text(w)
            if not clean_w:
                continue
            if clean_w not in norm_title and clean_w not in norm_uploader and clean_w not in norm_channel:
                all_words_match = False
                break
        if all_words_match:
            return True
            
    return False

def is_track_match(target_track, video_title):
    if not target_track:
        return True
    
    # Strip common youtube suffixes from video_title before comparing
    import re
    stop_words = {'official', 'audio', 'video', 'lyrics', 'lyric', 'mv', 'hd', 'hq'}
    title_words = re.findall(r'\b\w+\b', video_title.lower())
    clean_title_words = [w for w in title_words if w not in stop_words]
            
    norm_target = normalize_text(target_track)
    norm_title_clean = "".join(clean_title_words)
    
    if not norm_target or not norm_title_clean:
        return True
        
    # Check if similarity is above 65%
    similarity = difflib.SequenceMatcher(None, norm_target, norm_title_clean).ratio()
    if similarity >= 0.65:
        return True
            
    return False

def is_duration_match(expected_duration_str, video_duration_seconds, tolerance=45):
    if not expected_duration_str or expected_duration_str == "-":
        return True # Cannot verify
        
    try:
        # expected_duration_str is like "4m 27s"
        parts = expected_duration_str.replace("s", "").split("m")
        if len(parts) == 2:
            expected_seconds = int(parts[0].strip()) * 60 + int(parts[1].strip())
        elif len(parts) == 1:
            expected_seconds = int(parts[0].strip())
        else:
            return True
            
        if abs(expected_seconds - video_duration_seconds) <= tolerance:
            return True
        return False
    except Exception:
        return True

REMASTER_KEYWORDS = {'remaster', 'remastered', 'deluxe', 'anniversary', 'edition', 're-release', 'reissue'}

def is_release_date_match(spotify_release_date, yt_upload_date, yt_title="", tolerance_years=2):
    """
    Checks if the YouTube upload date is within ±tolerance_years of the Spotify release date.
    If the YouTube title contains remaster keywords, the tolerance is widened to ±10 years
    since remasters are re-releases of the same song at higher quality.
    
    spotify_release_date: "YYYY-MM-DD" or "YYYY" (from Spotify CSV)
    yt_upload_date: "YYYYMMDD" (yt-dlp format) or None
    yt_title: YouTube video title (for remaster detection)
    Returns: (matches: bool, is_remaster: bool)
    """
    if not spotify_release_date or not yt_upload_date:
        return True, False  # Cannot verify, allow it
    
    try:
        # Parse Spotify release year
        spotify_year = int(spotify_release_date[:4])
        # Parse YouTube upload year
        yt_year = int(yt_upload_date[:4])
    except (ValueError, IndexError):
        return True, False  # Cannot parse, allow it
    
    # Detect remaster from YouTube title
    is_remaster = False
    if yt_title:
        title_lower = yt_title.lower()
        is_remaster = any(kw in title_lower for kw in REMASTER_KEYWORDS)
    
    # Widen tolerance for remasters
    effective_tolerance = 10 if is_remaster else tolerance_years
    
    if abs(spotify_year - yt_year) <= effective_tolerance:
        return True, is_remaster
    return False, is_remaster

def search_and_scrape(download_list, base_url, is_single_query=False):
    """
    Searches YouTube and downloads audio as 192kbps MP3.
    Supports playlist folders and duplicate checking.
    Strictly verifies artist matches in batch mode.
    """
    results = {}
    total_items = len(download_list)
    downloads_dir = os.path.join(os.getcwd(), 'downloads')
    os.makedirs(downloads_dir, exist_ok=True)
    
    persistent_cache = load_cache()
    dir_cache = build_dir_cache(downloads_dir)
    
    for idx, item_dict in enumerate(download_list, 1):
        item = item_dict["query"]
        playlist_name = item_dict["playlist"]
        target_artist = item_dict.get("artist", "")
        
        print(f"\n{'='*70}")
        print(f"Processing [{idx}/{total_items}]")
        print(f"{'='*70}")
        print(f"🔍 Searching for: {item}")
        
        # Log to structured audit log
        logger.info("Processing scrape item", extra={"query": item, "index": idx, "total": total_items})
        
        # Determine specific folder for download
        if playlist_name:
            # Clean playlist name for filesystem compatibility
            safe_playlist = "".join(c for c in playlist_name if c.isalnum() or c in (' ', '_', '-')).strip()
            track_download_dir = os.path.join(downloads_dir, safe_playlist)
        else:
            track_download_dir = downloads_dir
            
        os.makedirs(track_download_dir, exist_ok=True)
        
        start_time = time.time()
        search_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # --- Check if already downloaded ---
        existing_file = None
        if item in persistent_cache:
            cache_entry = persistent_cache[item]
            if isinstance(cache_entry, str):
                cached_path = cache_entry
            else:
                cached_path = cache_entry.get("file_path", "")
            
            if os.path.exists(cached_path):
                existing_file = cached_path

        # ID-based fallback cache lookup
        if not existing_file and item_dict.get("id"):
            target_id = item_dict["id"]
            for cached_item, cache_entry in persistent_cache.items():
                if isinstance(cache_entry, dict) and cache_entry.get("id") == target_id:
                    cached_path = cache_entry.get("file_path", "")
                    if os.path.exists(cached_path):
                        existing_file = cached_path
                        persistent_cache[item] = cache_entry
                        save_cache(persistent_cache)
                        break

        if not existing_file:
            existing_file = check_already_downloaded(item, dir_cache, item_dict)
            if existing_file:
                persistent_cache[item] = {
                    "id": item_dict.get("id", ""),
                    "query": item,
                    "file_path": existing_file,
                    "youtube_title": item_dict.get("track", os.path.splitext(os.path.basename(existing_file))[0]),
                    "youtube_artist": item_dict.get("artist", "Unknown (Local Cache)")
                }
                save_cache(persistent_cache)
                
        if existing_file:
            relative_path = os.path.relpath(existing_file, downloads_dir)
            print(f"  ✓ Already downloaded: {item} (found at downloads/{relative_path})")
            print(f"    Skipping download.")
            results[item] = {
                'title': item_dict.get("track", os.path.splitext(os.path.basename(existing_file))[0]),
                'artist': item_dict.get("artist", "Local Cache"),
                'album': item_dict.get("album", playlist_name if playlist_name else 'Already Downloaded'),
                'duration': item_dict.get("duration", "-"),
                'type': 'track',
                'url': 'local',
                'status': 'downloaded',
                'search_time': search_time_str,
                'download_time': '0.0s',
                'download_completed': search_time_str
            }
            emit_log('downloadLinks', item, results[item])
            continue
            
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(track_download_dir, '%(title)s.%(ext)s'),
            'writethumbnail': True,
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                },
                {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                },
                {
                    'key': 'EmbedThumbnail',
                }
            ],
            'quiet': True,
            'no_warnings': True,
        }
        
        # In batch mode, we pull up to 5 results to ensure we find a matching artist
        if is_single_query:
            query = f"ytsearch1:{item}"
        else:
            query = f"ytsearch5:{item} Official Audio"
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(query, download=False)
                
                selected_entry = None
                if 'entries' in info and len(info['entries']) > 0:
                    entries = info['entries']
                    if is_single_query:
                        # User prompted query: bypass verification, take first result
                        selected_entry = entries[0]
                    else:
                        # Batch mode: find first matching entry
                        for entry in entries:
                            if not entry:
                                continue
                            title = entry.get('title', '')
                            uploader = entry.get('uploader', '')
                            channel = entry.get('channel', '')
                            duration = entry.get('duration', 0)
                            expected_duration = item_dict.get("duration", "-")
                            target_track = item_dict.get("track", "")
                            
                            if not is_artist_match(target_artist, title, uploader, channel):
                                print(f"    [Skipping] Artist mismatch for '{title}' (Channel: {channel})")
                                continue
                                
                            if not is_track_match(target_track, title):
                                print(f"    [Skipping] Track title mismatch for '{title}' (Expected: {target_track})")
                                continue
                                
                            if not is_duration_match(expected_duration, duration):
                                print(f"    [Skipping] Duration mismatch for '{title}' ({duration}s vs expected {expected_duration})")
                                continue
                                
                            selected_entry = entry
                            break
                
                if selected_entry:
                    title = selected_entry.get('title', 'Unknown Title')
                    uploader = selected_entry.get('uploader', 'Unknown Artist')
                    duration = selected_entry.get('duration', 0)
                    webpage_url = selected_entry.get('webpage_url', '')
                    if not webpage_url:
                        webpage_url = f"https://www.youtube.com/watch?v={selected_entry.get('id')}"
                    
                    # Format duration
                    mins, secs = divmod(int(duration), 60)
                    duration_str = f"{mins}m {secs}s"
                    
                    print(f"  ✓ Found Match: {title}")
                    print(f"    Artist: {uploader}")
                    if playlist_name:
                        print(f"    Playlist: {playlist_name}")
                    print(f"    Album: YouTube Video")
                    print(f"    Duration: {duration_str}")
                    print(f"    Type: Track")
                    print(f"    🔗 Link: {webpage_url}")
                    print(f"    ⏱️ Search completed at: {search_time_str}")
                    
                    print(f"\n    ⬇️ Starting download (with metadata & cover art)...\n")
                    
                    # Override metadata fields with Spotify details for embedding
                    selected_entry['title'] = item_dict.get('track') or title
                    selected_entry['artist'] = item_dict.get('artist') or uploader
                    selected_entry['album'] = playlist_name if playlist_name else 'SpotScraper Downloads'
                    selected_entry['track'] = item_dict.get('track') or title
                    selected_entry['uploader'] = item_dict.get('artist') or uploader
                    if item_dict.get('id'):
                        selected_entry['comment'] = f"Spotify URI: {item_dict['id']}"
                    
                    # Process download and embed metadata/artwork
                    ydl.process_info(selected_entry)
                    
                    # Update cache with new file
                    new_file = None
                    try:
                        prepared_filename = ydl.prepare_filename(selected_entry)
                        mp3_filename = os.path.splitext(prepared_filename)[0] + ".mp3"
                        if os.path.exists(mp3_filename):
                            new_file = mp3_filename
                    except Exception as prep_err:
                        print(f"    (Warning preparing filename: {prep_err})")
                    
                    # Fallback scan: match downloaded file by YouTube title first, then check_already_downloaded
                    clean_yt_title = "".join(c for c in title if c.isalnum()).lower()
                    for file in os.listdir(track_download_dir):
                        if file.endswith('.mp3'):
                            filepath = os.path.join(track_download_dir, file)
                            filename_no_ext = os.path.splitext(file)[0]
                            clean_filename = "".join(c for c in filename_no_ext if c.isalnum()).lower()
                            dir_cache[clean_filename] = filepath
                            if not new_file and (clean_yt_title in clean_filename or clean_filename in clean_yt_title):
                                new_file = filepath
                            
                    if not new_file:
                        new_file = check_already_downloaded(item, dir_cache, item_dict)
                    
                    if new_file:
                        persistent_cache[item] = {
                            "id": item_dict.get("id", ""),
                            "query": item,
                            "file_path": new_file,
                            "youtube_title": title,
                            "youtube_artist": uploader
                        }
                        save_cache(persistent_cache)
                    
                    end_time = time.time()
                    actual_duration = end_time - start_time
                    download_completed_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    print(f"    ✅ Download complete in {actual_duration:.1f}s")
                    print(f"    Completed at: {download_completed_str}\n")
                    logger.info("Download complete", extra={"query": item, "url": webpage_url, "duration": actual_duration})
                    results[item] = {
                        'title': title,
                        'artist': uploader,
                        'album': playlist_name if playlist_name else 'YouTube Video',
                        'duration': duration_str,
                        'type': 'track',
                        'url': webpage_url,
                        'status': 'downloaded',
                        'search_time': search_time_str,
                        'download_time': f"{actual_duration:.1f}s",
                        'download_completed': download_completed_str
                    }
                    emit_log('downloadLinks', item, results[item])
                else:
                    if is_single_query:
                        print(f"  ✗ No results found for: {item}")
                        results[item] = {
                            'title': item,
                            'status': 'not_found',
                            'search_time': search_time_str
                        }
                        emit_log('downloadLinks', item, results[item])
                    else:
                        print(f"  ✗ Skipped: Artist mismatch. checked up to 5 results for: {item} (target artist: '{target_artist}')")
                        
                        # --- FALLBACK: Retry with release year for more accurate results ---
                        release_date = item_dict.get("release_date", "")
                        fallback_entry = None
                        
                        if release_date and len(release_date) >= 4:
                            release_year = release_date[:4]
                            fallback_query = f"ytsearch5:{item} {release_year}"
                            print(f"  🔄 [Fallback] Retrying with release year: {release_year}")
                            
                            try:
                                fallback_info = ydl.extract_info(fallback_query, download=False)
                                if 'entries' in fallback_info and len(fallback_info['entries']) > 0:
                                    for fb_entry in fallback_info['entries']:
                                        if not fb_entry:
                                            continue
                                        fb_title = fb_entry.get('title', '')
                                        fb_duration = fb_entry.get('duration', 0)
                                        fb_upload_date = fb_entry.get('upload_date', '')
                                        expected_duration = item_dict.get("duration", "-")
                                        target_track = item_dict.get("track", "")
                                        
                                        # Check track title match (required)
                                        if not is_track_match(target_track, fb_title):
                                            print(f"    [Fallback Skip] Track mismatch for '{fb_title}' (Expected: {target_track})")
                                            continue
                                        
                                        # Check release date proximity (required when available)
                                        date_matches, is_remaster = is_release_date_match(release_date, fb_upload_date, fb_title)
                                        if not date_matches:
                                            print(f"    [Fallback Skip] Release date mismatch for '{fb_title}' (upload: {fb_upload_date}, expected: ~{release_year})")
                                            continue
                                        
                                        # Check duration match (required when available)
                                        if not is_duration_match(expected_duration, fb_duration):
                                            print(f"    [Fallback Skip] Duration mismatch for '{fb_title}' ({fb_duration}s vs expected {expected_duration})")
                                            continue
                                        
                                        remaster_tag = " [Remaster]" if is_remaster else ""
                                        print(f"  ✓ [Fallback] Found match: {fb_title}{remaster_tag}")
                                        fallback_entry = fb_entry
                                        break
                            except Exception as fb_err:
                                print(f"    [Fallback Error] {str(fb_err)}")
                        
                        if fallback_entry:
                            # Process the fallback match (same download flow as normal match)
                            title = fallback_entry.get('title', 'Unknown Title')
                            uploader = fallback_entry.get('uploader', 'Unknown Artist')
                            duration = fallback_entry.get('duration', 0)
                            webpage_url = fallback_entry.get('webpage_url', '')
                            if not webpage_url:
                                webpage_url = f"https://www.youtube.com/watch?v={fallback_entry.get('id')}"
                            
                            mins, secs = divmod(int(duration), 60)
                            duration_str = f"{mins}m {secs}s"
                            
                            print(f"    Artist: {uploader}")
                            if playlist_name:
                                print(f"    Playlist: {playlist_name}")
                            print(f"    Duration: {duration_str}")
                            print(f"    🔗 Link: {webpage_url}")
                            print(f"\n    ⬇️ Starting download (with metadata & cover art)...\n")
                            
                            # Override metadata fields with Spotify details
                            fallback_entry['title'] = item_dict.get('track') or title
                            fallback_entry['artist'] = item_dict.get('artist') or uploader
                            fallback_entry['album'] = playlist_name if playlist_name else 'SpotScraper Downloads'
                            fallback_entry['track'] = item_dict.get('track') or title
                            fallback_entry['uploader'] = item_dict.get('artist') or uploader
                            if item_dict.get('id'):
                                fallback_entry['comment'] = f"Spotify URI: {item_dict['id']}"
                            
                            ydl.process_info(fallback_entry)
                            
                            # Update cache with new file
                            new_file = None
                            try:
                                prepared_filename = ydl.prepare_filename(fallback_entry)
                                mp3_filename = os.path.splitext(prepared_filename)[0] + ".mp3"
                                if os.path.exists(mp3_filename):
                                    new_file = mp3_filename
                            except Exception as prep_err:
                                print(f"    (Warning preparing filename: {prep_err})")
                            
                            clean_yt_title = "".join(c for c in title if c.isalnum()).lower()
                            for file in os.listdir(track_download_dir):
                                if file.endswith('.mp3'):
                                    filepath = os.path.join(track_download_dir, file)
                                    filename_no_ext = os.path.splitext(file)[0]
                                    clean_filename = "".join(c for c in filename_no_ext if c.isalnum()).lower()
                                    dir_cache[clean_filename] = filepath
                                    if not new_file and (clean_yt_title in clean_filename or clean_filename in clean_yt_title):
                                        new_file = filepath
                            
                            if not new_file:
                                new_file = check_already_downloaded(item, dir_cache, item_dict)
                            
                            if new_file:
                                persistent_cache[item] = {
                                    "id": item_dict.get("id", ""),
                                    "query": item,
                                    "file_path": new_file,
                                    "youtube_title": title,
                                    "youtube_artist": uploader
                                }
                                save_cache(persistent_cache)
                            
                            end_time = time.time()
                            actual_duration = end_time - start_time
                            download_completed_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            
                            print(f"    ✅ Download complete in {actual_duration:.1f}s (via release-date fallback)")
                            print(f"    Completed at: {download_completed_str}\n")
                            logger.info("Download complete (fallback)", extra={"query": item, "url": webpage_url, "duration": actual_duration, "fallback": True})
                            results[item] = {
                                'title': title,
                                'artist': uploader,
                                'album': playlist_name if playlist_name else 'YouTube Video',
                                'duration': duration_str,
                                'type': 'track',
                                'url': webpage_url,
                                'status': 'downloaded',
                                'search_time': search_time_str,
                                'download_time': f"{actual_duration:.1f}s",
                                'download_completed': download_completed_str
                            }
                            emit_log('downloadLinks', item, results[item])
                        else:
                            # Fallback also failed or no release date available
                            results[item] = {
                                'title': item,
                                'status': 'skipped_mismatch',
                                'search_time': search_time_str,
                                'error': f"Artist mismatch (target: {target_artist})"
                            }
                            emit_log('downloadLinks', item, results[item])
                        
        except Exception as e:
            err_msg = str(e).lower()
            if "confirm your age" in err_msg or "age restricted" in err_msg or "sign in" in err_msg:
                print(f"  [!] YouTube age restriction encountered. Bypassing by falling back to SoundCloud...")
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl_sc:
                        sc_info = ydl_sc.extract_info(f"scsearch1:{item}", download=True)
                        if 'entries' in sc_info and len(sc_info['entries']) > 0:
                            sc_entry = sc_info['entries'][0]
                            sc_title = sc_entry.get('title', item)
                            sc_uploader = sc_entry.get('uploader', 'SoundCloud Artist')
                            print(f"  ✓ [SoundCloud] Successfully downloaded: {sc_title}")
                            
                            results[item] = {
                                'title': sc_title,
                                'artist': sc_uploader,
                                'album': playlist_name if playlist_name else 'SoundCloud Audio',
                                'duration': '-',
                                'type': 'track',
                                'url': sc_entry.get('webpage_url', 'local'),
                                'status': 'downloaded',
                                'search_time': search_time_str,
                                'download_time': 'Fallback',
                                'download_completed': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            }
                            emit_log('downloadLinks', item, results[item])
                            continue
                except Exception as sc_err:
                    print(f"  ✗ SoundCloud fallback also failed: {str(sc_err)}")
                    
            print(f"  ✗ Error searching/downloading: {item} - {str(e)}")
            logger.error("Download failed", extra={"query": item, "error": str(e)})
            time.sleep(2)
            results[item] = {
                'title': item,
                'status': 'error',
                'error': str(e),
                'search_time': search_time_str
            }
            emit_log('downloadLinks', item, results[item])
            
    return results

if __name__ == "__main__":
    import sys
    
    # 1. Define the folder containing your Spotify History JSONs / CSVs
    json_folder = 'spotify_data' if os.path.exists('spotify_data') else 'json_directory'
    
    default_url = "https://qobuz.squid.wtf"
    target_website = default_url
    items_to_download = []
    test_limit = 3
    is_single_query = False

    if len(sys.argv) > 1 and sys.argv[1] == "query":
        is_single_query = True
        if len(sys.argv) > 2:
            items_to_download = [{"query": sys.argv[2], "track": "", "artist": "", "playlist": ""}]
        else:
            items_to_download = [{"query": "Test Track", "track": "", "artist": "", "playlist": ""}]
        test_limit = 1
        if len(sys.argv) > 3:
            target_website = sys.argv[3].strip()
    else:
        if not os.path.exists(json_folder):
            print(f"Please create a folder named '{json_folder}' and put your JSONs/CSVs there.")
            exit()
            
        specific_file = None
        if len(sys.argv) > 3:
            specific_file = sys.argv[3].strip()
            
        items_to_download = parse_spotify_data(json_folder, specific_file=specific_file)
        print(f"Parsed files. Found {len(items_to_download)} unique items to download.")
        
        if not items_to_download:
            print("No valid Spotify streams or custom CSV items found.")
            exit()
            
        if len(sys.argv) > 1:
            try:
                test_limit = int(sys.argv[1])
            except ValueError:
                print(f"Invalid limit argument: {sys.argv[1]}. Using default of 3.")
                
        if len(sys.argv) > 2:
            target_website = sys.argv[2].strip()
            
    if is_single_query:
        print(f"\nRunning single search and download for query: {items_to_download[0]['query']}...")
        logger.info("Scraper execution started (single query)", extra={"target_website": target_website, "query": items_to_download[0]['query']})
    else:
        print(f"\nRunning test on first {test_limit} items...")
        logger.info("Scraper execution started (batch)", extra={"target_website": target_website, "limit": test_limit, "total_found": len(items_to_download)})
    
    download_links = search_and_scrape(items_to_download[:test_limit], target_website, is_single_query=is_single_query)
    
    print("\nDownload complete. Check the 'downloads' folder!")
    logger.info("Scraper execution finished")