import json
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def parse_spotify_history(json_directory, search_mode="albums", album_threshold=4):
    """Parses Spotify Extended Streaming History into a unique search list."""
    albums_data = {}  
    standalone_tracks = set()
    
    for filename in os.listdir(json_directory):
        if filename.endswith(".json"):
            filepath = os.path.join(json_directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    continue
                
                for stream in data:
                    track = stream.get("master_metadata_track_name")
                    artist = stream.get("master_metadata_album_artist_name")
                    album = stream.get("master_metadata_album_album_name")
                    
                    if track and artist:
                        if search_mode == "albums" and album:
                            key = (artist, album)
                            if key not in albums_data:
                                albums_data[key] = set()
                            albums_data[key].add(track)
                        else:
                            standalone_tracks.add(f"{track} {artist}")
                            
    download_list = list(standalone_tracks)
    
    if search_mode == "albums":
        for (artist, album), tracks in albums_data.items():
            if len(tracks) >= album_threshold:
                download_list.append(f"{album} {artist}")
            else:
                for t in tracks:
                    download_list.append(f"{t} {artist}")
                
    return list(set(download_list))

def scrape_qobuz_squid(download_list, search_mode):
    base_url = "https://qobuz.squid.wtf"
    results = {}
    
    # 1. Prepare secure downloads folder
    download_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(download_dir, exist_ok=True)

    # 2. Configure Chrome to run cleanly and auto-download
    chrome_options = Options()
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    prefs = {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False, 
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    chrome_options.add_experimental_option("prefs", prefs)
    
    print(f"Launching browser... Files will drop into: {download_dir}")
    driver = webdriver.Chrome(options=chrome_options)
    wait = WebDriverWait(driver, 15) 
    short_wait = WebDriverWait(driver, 3) # For quick UI checks
    
    try:
        driver.get(base_url)
        time.sleep(3) # Initial load allowance for Next.js hydration
        
        for item in download_list:
            print(f"Searching for: {item}")
            
            try:
                # --- A. Filter Selection (Radix UI Dropdown) ---
                # We do this first to ensure the filter is correct before we search
                menu_btn_xpath = "//button[@aria-haspopup='menu']"
                try:
                    menu_btn = wait.until(EC.presence_of_element_located((By.XPATH, menu_btn_xpath)))
                    
                    # Check what the button currently says
                    current_filter = menu_btn.text.strip().lower()
                    
                    if search_mode.lower() not in current_filter:
                        # Open the dropdown menu via JS click
                        driver.execute_script("arguments[0].click();", menu_btn)
                        time.sleep(0.5) # Wait for Radix animation
                        
                        # Find the exact menu item and click it
                        item_xpath = f"//div[@role='menuitem' and contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{search_mode}')]"
                        menu_item = wait.until(EC.presence_of_element_located((By.XPATH, item_xpath)))
                        driver.execute_script("arguments[0].click();", menu_item)
                        print(f"  -> Switched filter to: {search_mode.capitalize()}")
                        time.sleep(1)
                except Exception as e:
                    print("  -> Could not interact with filter menu. Relying on default.")

                # --- B. Execute Search ---
                search_box = wait.until(EC.presence_of_element_located((By.ID, "search")))
                
                # Clear existing text (React-safe method)
                search_box.send_keys(Keys.CONTROL + "a")
                search_box.send_keys(Keys.BACKSPACE)
                
                # Input new search and hit Enter
                search_box.send_keys(item)
                search_box.send_keys(Keys.RETURN)
                
                # Wait for the site to process the search results
                time.sleep(4) 
                
                # --- C. Target and Download ---
                # Based on the HTML, the result card is a div with class 'group'
                # The download button has an SVG with class 'lucide-download'
                dl_btn_xpath = "(//div[contains(@class, 'group')]//button[.//svg[contains(@class, 'lucide-download')]])[1]"
                
                dl_btn = wait.until(EC.presence_of_element_located((By.XPATH, dl_btn_xpath)))
                
                # Force click the deeply nested, invisible button using JavaScript
                driver.execute_script("arguments[0].click();", dl_btn)
                
                print(f"✅ Download Triggered for: {item}")
                results[item] = "Success"
                
                # Wait 7 seconds for the backend to zip and start the actual file download
                time.sleep(7) 
                
            except Exception as e:
                print(f"❌ Failed processing '{item}'. No results found or UI error.")
                results[item] = "Failed: Not found"
            
    finally:
        print("\nWaiting 20 seconds for any final downloads to finish...")
        time.sleep(20)
        driver.quit()
        
    return results

if __name__ == "__main__":
    import sys
    
    json_folder = 'spotify_data' 
    items_to_download = []
    mode = "albums"
    test_limit = 5
    is_single_query = False
    
    # Check if arguments are passed from a runner (e.g. Node backend)
    # Argument format:
    #   python qobuz_scrapper.py query "[Search Query]"
    #   python qobuz_scrapper.py [mode] [limit]
    if len(sys.argv) > 1:
        arg1 = sys.argv[1].strip().lower()
        if arg1 == "query":
            is_single_query = True
            mode = "tracks"
            test_limit = 1
            if len(sys.argv) > 2:
                items_to_download = [sys.argv[2]]
            else:
                items_to_download = ["Test Track"]
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
                print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs there.")
                exit()
            items_to_download = parse_spotify_history(json_folder, search_mode=mode, album_threshold=4)
    else:
        if not os.path.exists(json_folder):
            print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs there.")
            exit()
            
        print("How would you like to search for your Spotify history?")
        print("[1] Group into Albums")
        print("[2] Search Individual Tracks Only")
        
        choice = input("Enter 1 or 2: ").strip()
        mode = "albums" if choice == "1" else "tracks"
        test_limit = 5
        items_to_download = parse_spotify_history(json_folder, search_mode=mode, album_threshold=4)
    
    print(f"\nFound {len(items_to_download)} total queries to execute.")
    
    if not items_to_download:
        print("No valid Spotify streams found.")
        exit()
    
    if is_single_query:
        print(f"\nRunning single search and download for query: {items_to_download[0]}...")
    else:
        print(f"\nRunning test on first {test_limit} items...")
    
    scrape_log = scrape_qobuz_squid(items_to_download[:test_limit], search_mode=mode)
    
    with open('scrape_log.json', 'w', encoding='utf-8') as f:
        json.dump(scrape_log, f, indent=4, ensure_ascii=False)
        
    print("\nScraping complete. Check the 'downloads' folder!")