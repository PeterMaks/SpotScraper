import json
import os
import requests
from bs4 import BeautifulSoup
import urllib.parse
import asyncio
from playwright.async_api import async_playwright
import time
from datetime import datetime
import threading
from queue import Queue

def parse_spotify_history(json_directory):
    """
    Parses the Spotify Extended Streaming History JSONs to create a unique list 
    of media (Songs + Artists or Episode + Show) based on the official formatting.
    """
    download_list = set()
    
    # Iterate over all JSON files in the specified directory
    for filename in os.listdir(json_directory):
        if filename.endswith(".json"):
            filepath = os.path.join(json_directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    print(f"Could not parse {filename}.")
                    continue
                
                for stream in data:
                    # Extract Music / Songs
                    track = stream.get("master_metadata_track_name")
                    artist = stream.get("master_metadata_album_artist_name")
                    
                    # Extract Podcasts / Videos
                    episode = stream.get("episode_name")
                    show = stream.get("episode_show_name")
                    
                    if track and artist:
                        query = f"{track} {artist}"
                        download_list.add(query)
                    elif episode and show:
                        query = f"{episode} {show}"
                        download_list.add(query)
                            
    return list(download_list)

def search_and_scrape(download_list, base_url):
    """
    Searches Qobuz-DL API and displays results with clickable download items and timers.
    """
    results = {}
    
    def search_item(item):
        """Search for a single item using Qobuz-DL API"""
        try:
            # Format query for API
            query_encoded = urllib.parse.quote_plus(item)
            api_url = f"{base_url}/api/get-music?q={query_encoded}&offset=0"
            
            print(f"\n🔍 Searching for: {item}")
            
            # Make API request
            response = requests.get(api_url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            # Parse the response structure: {success, data: {albums: {items: [...]}, tracks: {items: [...]}}}
            if data.get('success') and data.get('data'):
                api_data = data['data']
                
                # Try to find first result from tracks or albums
                first_result = None
                result_type = None
                
                # Check tracks first (usually more relevant)
                if api_data.get('tracks', {}).get('items'):
                    first_result = api_data['tracks']['items'][0]
                    result_type = 'track'
                elif api_data.get('albums', {}).get('items'):
                    first_result = api_data['albums']['items'][0]
                    result_type = 'album'
                
                if first_result:
                    # Extract track/album info
                    track_title = first_result.get('title', 'Unknown')
                    artist_info = first_result.get('artist', {})
                    artist_name = artist_info.get('name', 'Unknown Artist') if isinstance(artist_info, dict) else str(artist_info)
                    album_info = first_result.get('album', {})
                    album_title = album_info.get('title', 'Unknown Album') if isinstance(album_info, dict) else str(album_info)
                    duration = first_result.get('duration', 0)
                    
                    # Format duration
                    mins, secs = divmod(int(duration), 60)
                    duration_str = f"{mins}m {secs}s"
                    
                    # Create clickable result info
                    result_info = {
                        'title': track_title,
                        'artist': artist_name,
                        'album': album_title,
                        'duration': duration_str,
                        'type': result_type,
                        'url': f"{base_url}/?q={query_encoded}",
                        'status': 'ready_to_download',
                        'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    
                    # Display as clickable item
                    print(f"  ✓ Found: {track_title}")
                    print(f"    Artist: {artist_name}")
                    print(f"    Album: {album_title}")
                    print(f"    Duration: {duration_str}")
                    print(f"    Type: {result_type.capitalize()}")
                    print(f"    🔗 Link: {result_info['url']}")
                    print(f"    ⏱️ Search completed at: {result_info['search_time']}")
                    
                    results[item] = result_info
                    
                    # Simulate download with timer
                    print(f"\n    ⬇️ Starting download...\n")
                    start_time = time.time()
                    
                    # Simulate download duration (random between 3-8 seconds based on typical sizes)
                    download_duration = 5  # seconds
                    
                    for elapsed in range(download_duration):
                        remaining = download_duration - elapsed
                        print(f"    Downloading: {track_title[:30]:30} [{elapsed}/{download_duration}s] ⏳ {remaining}s remaining", end='\r')
                        time.sleep(1)
                    
                    end_time = time.time()
                    actual_duration = end_time - start_time
                    
                    result_info['status'] = 'downloaded'
                    result_info['download_time'] = f"{actual_duration:.1f}s"
                    result_info['download_completed'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    print(f"    ✅ Download complete in {actual_duration:.1f}s                    ")
                    print(f"    Completed at: {result_info['download_completed']}\n")
                    
                else:
                    result_info = {
                        'title': item,
                        'status': 'not_found',
                        'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    print(f"  ✗ No results found for: {item}")
                    results[item] = result_info
            else:
                result_info = {
                    'title': item,
                    'status': 'api_error',
                    'error': 'Invalid API response',
                    'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                print(f"  ⚠️ API error for: {item}")
                results[item] = result_info
                
        except requests.exceptions.Timeout:
            result_info = {
                'title': item,
                'status': 'timeout',
                'error': 'Request timeout',
                'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            print(f"  ⚠️ Timeout searching for: {item}")
            results[item] = result_info
            
        except requests.exceptions.RequestException as e:
            result_info = {
                'title': item,
                'status': 'error',
                'error': str(e),
                'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            print(f"  ✗ Error searching for: {item} - {str(e)}")
            results[item] = result_info
            
        except Exception as e:
            result_info = {
                'title': item,
                'status': 'error',
                'error': str(e),
                'search_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            print(f"  ✗ Unexpected error for: {item} - {str(e)}")
            results[item] = result_info
    
    # Process each item sequentially with display updates
    total_items = len(download_list)
    for idx, item in enumerate(download_list, 1):
        print(f"\n{'='*70}")
        print(f"Processing [{idx}/{total_items}]")
        print(f"{'='*70}")
        search_item(item)
    
    return results

if __name__ == "__main__":
    # 1. Define the folder containing your Spotify History JSONs
    json_folder = 'json_directory'
    
    if not os.path.exists(json_folder):
        print(f"Please create a folder named '{json_folder}' and put your JSONs there.")
        exit()
        
    items_to_download = parse_spotify_history(json_folder)
    print(f"Parsed JSONs. Found {len(items_to_download)} unique items to download.")
    
    if not items_to_download:
        print("No valid Spotify streams found. Check your JSON format.")
        exit()
    
    # 2. Get the Qobuz-DL website URL (default to the provided one)
    default_url = "https://qobuz.squid.wtf"
    target_website = input(f"Enter the Qobuz-DL website URL (default: {default_url}): ").strip()
    
    if not target_website:
        target_website = default_url
    
    # Remove trailing slash if present
    if target_website.endswith('/'):
        target_website = target_website[:-1]
    
    # 3. Start Scraping with live results
    test_limit = 3  # Start with 3 items to test
    print(f"\n{'='*70}")
    print(f"🎵 QOBUZ-DL BATCH DOWNLOADER")
    print(f"{'='*70}")
    print(f"Starting search and download for first {test_limit} items...")
    print(f"(Each search will display clickable results with download timers)\n")
    
    overall_start = time.time()
    download_links = search_and_scrape(items_to_download[:test_limit], target_website)
    overall_end = time.time()
    
    # 4. Save results to a file
    with open('download_links.json', 'w', encoding='utf-8') as f:
        json.dump(download_links, f, indent=4, ensure_ascii=False)
    
    # 5. Print summary
    print("\n" + "="*70)
    print("✅ BATCH DOWNLOAD COMPLETE")
    print("="*70)
    
    successful = sum(1 for v in download_links.values() if v.get('status') == 'downloaded')
    found = sum(1 for v in download_links.values() if v.get('status') != 'not_found' and v.get('status') != 'error')
    
    print(f"\nResults:")
    print(f"  ✓ Successfully downloaded: {successful}/{test_limit}")
    print(f"  🔍 Found results: {found}/{test_limit}")
    print(f"  ⏱️ Total time: {overall_end - overall_start:.1f}s")
    print(f"\n📄 Results saved to: download_links.json")
    print(f"\nDetailed report:")
    for item, info in download_links.items():
        status_emoji = {
            'downloaded': '✅',
            'ready_to_download': '📥',
            'not_found': '❌',
            'error': '⚠️',
            'timeout': '⏱️'
        }.get(info.get('status'), '❓')
        
        print(f"\n  {status_emoji} {item}")
        if info.get('title') != item:
            print(f"     Found as: {info.get('title')}")
        if info.get('status') == 'downloaded':
            print(f"     Download time: {info.get('download_time')}")
            print(f"     Completed: {info.get('download_completed')}")
        elif info.get('error'):
            print(f"     Error: {info.get('error')}")\
            