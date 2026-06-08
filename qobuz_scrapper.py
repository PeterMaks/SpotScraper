import json
import os
import time
import csv
import yt_dlp
import imageio_ffmpeg
import unicodedata
import sys
import io

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
        for idx, val in enumerate(first_row):
            if val in ('track', 'song', 'title', 'name', 'track name', 'song name'):
                track_idx = idx
            elif val in ('artist', 'singer', 'band', 'artist name', 'artist name(s)', 'artists'):
                artist_idx = idx
            elif val in ('playlist', 'folder', 'category', 'playlist name'):
                playlist_idx = idx
            elif val in ('uri', 'track uri', 'id', 'spotify uri'):
                uri_idx = idx
                
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
                
                if track:
                    query = f"{track} {artist}".strip()
                    if not uri:
                        import hashlib
                        uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist})
            else:
                # No header: treat first cell as query, second as optional playlist
                cells = [str(c).strip() if c is not None else "" for c in row]
                if len(cells) >= 2:
                    track = cells[0]
                    artist = cells[1]
                    playlist = cells[2] if len(cells) > 2 else ""
                    query = f"{track} {artist}".strip()
                    import hashlib
                    uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist})
                elif len(cells) == 1 and cells[0]:
                    track = cells[0]
                    query = track
                    import hashlib
                    uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                    tracks.append({"id": uri, "query": query, "track": track, "artist": "", "playlist": ""})
    except Exception as e:
        print(f"Error parsing Excel file {filepath}: {e}")
    return tracks

def parse_spotify_data(json_directory, search_mode="albums", album_threshold=4, specific_file=None):
    """
    Parses Spotify streaming history, playlists, custom CSV files, and Excel sheets.
    Returns a list of unique dicts: [{"query": "track artist", "playlist": "playlist_name"}]
    """
    # 1. Parse Playlists first to build a mapping from (track, artist) -> playlist_name
    track_to_playlist = {} # maps (track.lower(), artist.lower()) -> playlist_name
    
    if os.path.exists(json_directory):
        for filename in os.listdir(json_directory):
            if filename.endswith(".json") and "playlist" in filename.lower():
                filepath = os.path.join(json_directory, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
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
                        sample = f.read(2048)
                        f.seek(0)
                        has_header = False
                        try:
                            has_header = csv.Sniffer().has_header(sample)
                        except Exception:
                            pass
                        
                        reader = csv.reader(f)
                        if has_header:
                            headers = [h.strip().lower() for h in next(reader)]
                            track_idx, artist_idx, playlist_idx, uri_idx = -1, -1, -1, -1
                            for idx, h in enumerate(headers):
                                if h in ('track', 'song', 'title', 'name', 'track name', 'song name'):
                                    track_idx = idx
                                elif h in ('artist', 'singer', 'band', 'artist name', 'artist name(s)', 'artists'):
                                    artist_idx = idx
                                elif h in ('playlist', 'folder', 'category', 'playlist name'):
                                    playlist_idx = idx
                                elif h in ('uri', 'track uri', 'id', 'spotify uri'):
                                    uri_idx = idx
                            
                            for row in reader:
                                if not row:
                                    continue
                                track = row[track_idx].strip() if track_idx != -1 and track_idx < len(row) else ""
                                artist = row[artist_idx].strip() if artist_idx != -1 and artist_idx < len(row) else ""
                                playlist = row[playlist_idx].strip() if playlist_idx != -1 and playlist_idx < len(row) else ""
                                uri = row[uri_idx].strip() if uri_idx != -1 and uri_idx < len(row) else ""
                                
                                if track:
                                    query = f"{track} {artist}".strip()
                                    if query not in seen_queries:
                                        seen_queries.add(query)
                                        if not uri:
                                            import hashlib
                                            uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist})
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
                                        uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist})
                                elif len(row) == 1:
                                    track = row[0].strip()
                                    query = track
                                    if query not in seen_queries:
                                        seen_queries.add(query)
                                        import hashlib
                                        uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                                        download_items.append({"id": uri, "query": query, "track": track, "artist": "", "playlist": ""})
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
                        download_items.append({"id": uri, "query": query, "track": t.get("track", ""), "artist": t.get("artist", ""), "playlist": playlist})
                    
            # B. Parse Spotify Streaming History files
            elif filename.endswith(".json") and "playlist" not in filename.lower():
                with open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError:
                        continue
                    
                    for stream in data:
                        track = stream.get("master_metadata_track_name")
                        artist = stream.get("master_metadata_album_artist_name")
                        
                        if track and artist:
                            query = f"{track} {artist}"
                            if query not in seen_queries:
                                seen_queries.add(query)
                                playlist_name = track_to_playlist.get((track.lower().strip(), artist.lower().strip()), "")
                                import hashlib
                                uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                                download_items.append({"id": uri, "query": query, "track": track, "artist": artist, "playlist": playlist_name})
                        elif episode and show:
                            query = f"{episode} {show}"
                            if query not in seen_queries:
                                seen_queries.add(query)
                                import hashlib
                                uri = "local:" + hashlib.md5(query.encode('utf-8')).hexdigest()[:12]
                                download_items.append({"id": uri, "query": query, "track": episode, "artist": show, "playlist": "Podcasts"})
                                
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

    def get_tokens(text):
        if not text:
            return []
        text = unicodedata.normalize('NFKD', text)
        # Remove apostrophes completely to handle contractions
        for char in "'`’":
            text = text.replace(char, '')
        for char in "-_+=/\\|()[]{}?.,!;:\":~@#$%^&*~？。，、":
            text = text.replace(char, ' ')
        return [w.lower() for w in text.split() if w.isalnum()]

    track_tokens = get_tokens(track)
    artist_tokens = get_tokens(artist) if artist else []
    
    if not track_tokens:
        return None

    stop_tokens = {'official', 'video', 'audio', 'lyrics', 'lyric', 'mv', 'hq', 'hd', '320kbps', 'mp3', 'cover'}
    filtered_track_tokens = [w for w in track_tokens if w not in stop_tokens]
    if not filtered_track_tokens:
        filtered_track_tokens = track_tokens

    track_set = set(filtered_track_tokens)
    artist_set = set(artist_tokens)

    for clean_filename, filepath in dir_cache.items():
        filename_no_ext = os.path.splitext(os.path.basename(filepath))[0]
        file_tokens = get_tokens(filename_no_ext)
        file_set = set(file_tokens)

        # 1. Try matching using track and artist tokens
        if track_set.issubset(file_set):
            # Perfect match (track and artist)
            if not artist_set or artist_set.intersection(file_set):
                return filepath
            # Track match, artist mismatch: require track name to be reasonably long/unique
            track_char_len = sum(len(w) for w in filtered_track_tokens)
            if len(track_set) >= 2 or track_char_len >= 5:
                return filepath

        # 2. Fallback: length-guarded clean substring matching on query
        query_tokens = get_tokens(query)
        filtered_query_tokens = [w for w in query_tokens if w not in stop_tokens]
        if not filtered_query_tokens:
            filtered_query_tokens = query_tokens
        clean_query = "".join(filtered_query_tokens)
        if clean_query and (clean_query in clean_filename or clean_filename in clean_query):
            if len(clean_query) >= 5 or len(clean_query) == len(clean_filename):
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

def scrape_qobuz_squid(download_list, search_mode, is_single_query=False):
    results = {}
    downloads_dir = os.path.join(os.getcwd(), 'downloads')
    os.makedirs(downloads_dir, exist_ok=True)
    
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    persistent_cache = load_cache()
    dir_cache = build_dir_cache(downloads_dir)
    
    total_items = len(download_list)
    print(f"Launching YouTube-DL 320kbps... Files will drop into: {downloads_dir}")
    
    for idx, item_dict in enumerate(download_list, 1):
        item = item_dict["query"]
        playlist_name = item_dict["playlist"]
        target_artist = item_dict.get("artist", "")
        
        print(f"\nProcessing [{idx}/{total_items}]")
        print(f"Searching for: {item}")
        
        # Log to structured audit log
        logger.info("Processing scrape item", extra={"query": item, "index": idx, "total": total_items})
        
        # Determine specific folder for download
        if playlist_name:
            safe_playlist = "".join(c for c in playlist_name if c.isalnum() or c in (' ', '_', '-')).strip()
            track_download_dir = os.path.join(downloads_dir, safe_playlist)
        else:
            track_download_dir = downloads_dir
            
        os.makedirs(track_download_dir, exist_ok=True)
        
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
                    "youtube_title": os.path.splitext(os.path.basename(existing_file))[0],
                    "youtube_artist": "Unknown (Local Cache)"
                }
                save_cache(persistent_cache)
                
        if existing_file:
            relative_path = os.path.relpath(existing_file, downloads_dir)
            print(f"  ✓ Already downloaded: {item} (found at downloads/{relative_path})")
            print(f"    Skipping download.")
            results[item] = "Success"
            continue
            
        ydl_opts = {
            'format': 'bestaudio/best',
            'ffmpeg_location': ffmpeg_path,
            'outtmpl': os.path.join(track_download_dir, '%(title)s.%(ext)s'),
            'writethumbnail': True,
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
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
            query = f"ytsearch5:{item}"
        
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
                            if is_artist_match(target_artist, title, uploader, channel):
                                selected_entry = entry
                                break
                                
                if selected_entry:
                    title = selected_entry.get('title', 'Unknown Title')
                    uploader = selected_entry.get('uploader', 'Unknown Artist')
                    webpage_url = selected_entry.get('webpage_url', '')
                    if not webpage_url:
                        webpage_url = f"https://www.youtube.com/watch?v={selected_entry.get('id')}"
                    
                    print(f"  ✓ Found Match: {title}")
                    if playlist_name:
                        print(f"  Folder: downloads/{playlist_name}")
                    print(f"  -> Downloading at 320kbps MP3 (with metadata & cover art)...")
                    
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
                            "youtube_title": os.path.splitext(os.path.basename(new_file))[0],
                            "youtube_artist": title
                        }
                        save_cache(persistent_cache)
                        
                    print(f"✅ Download Triggered for: {item}")
                    logger.info("Download complete", extra={"query": item, "url": webpage_url})
                    results[item] = "Success"
                else:
                    if is_single_query:
                        print(f"❌ Failed processing '{item}'. No results found.")
                        results[item] = "Failed: Not found"
                    else:
                        print(f"❌ Skipped: Artist mismatch. checked up to 5 results for: {item} (target artist: '{target_artist}')")
                        results[item] = f"Skipped: Artist mismatch (target: {target_artist})"
        except Exception as e:
            print(f"❌ Failed processing '{item}'. Error: {str(e)}")
            logger.error("Download failed", extra={"query": item, "error": str(e)})
            results[item] = f"Failed: {str(e)}"
            
    return results

if __name__ == "__main__":
    import sys
    
    json_folder = 'spotify_data' 
    items_to_download = []
    mode = "albums"
    test_limit = 5
    is_single_query = False
    
    if len(sys.argv) > 1:
        arg1 = sys.argv[1].strip().lower()
        if arg1 == "query":
            is_single_query = True
            mode = "tracks"
            test_limit = 1
            if len(sys.argv) > 2:
                items_to_download = [{"query": sys.argv[2], "track": "", "artist": "", "playlist": ""}]
            else:
                items_to_download = [{"query": "Test Track", "track": "", "artist": "", "playlist": ""}]
        else:
            mode = arg1
            if mode not in ["albums", "tracks"]:
                print(f"Invalid mode argument '{mode}'. Defaulting to 'albums'.")
                mode = "albums"
            
            if len(sys.argv) > 2:
                try:
                    test_limit = int(sys.argv[2])
                except ValueError:
                    print(f"Invalid limit argument: {sys.argv[2]}. Using default of 5.")
                    
            if not os.path.exists(json_folder):
                print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs/CSVs there.")
                exit()
            
            specific_file = None
            if len(sys.argv) > 3:
                specific_file = sys.argv[3].strip()
                
            items_to_download = parse_spotify_data(json_folder, search_mode=mode, specific_file=specific_file)
    else:
        if not os.path.exists(json_folder):
            print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs/CSVs there.")
            exit()
            
        print("How would you like to search for your Spotify history?")
        print("[1] Group into Albums")
        print("[2] Search Individual Tracks Only")
        
        choice = input("Enter 1 or 2: ").strip()
        mode = "albums" if choice == "1" else "tracks"
        test_limit = 5
        items_to_download = parse_spotify_data(json_folder)
    
    print(f"\nFound {len(items_to_download)} total queries to execute.")
    
    if not items_to_download:
        print("No valid Spotify streams found.")
        exit()
    
    if is_single_query:
        print(f"\nRunning single search and download for query: {items_to_download[0]['query']}...")
        logger.info("Scraper execution started (single query)", extra={"query": items_to_download[0]['query']})
    else:
        print(f"\nRunning test on first {test_limit} items...")
        logger.info("Scraper execution started (batch)", extra={"limit": test_limit, "total_found": len(items_to_download)})
    
    scrape_log = scrape_qobuz_squid(items_to_download[:test_limit], search_mode=mode, is_single_query=is_single_query)
    
    existing_logs = {}
    if os.path.exists('scrape_log.json'):
        try:
            with open('scrape_log.json', 'r', encoding='utf-8') as f:
                existing_logs = json.load(f)
        except Exception:
            pass
            
    existing_logs.update(scrape_log)
    
    with open('scrape_log.json', 'w', encoding='utf-8') as f:
        json.dump(existing_logs, f, indent=4, ensure_ascii=False)
        
    print("\nScraping complete. Check the 'downloads' folder!")
    logger.info("Scraper execution finished")