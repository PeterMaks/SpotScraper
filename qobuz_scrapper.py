import json
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys  # Added for pressing Enter/Return
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def parse_spotify_history(json_directory):
    download_list = set()
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
                    if track and artist:
                        query = f"{track} {artist}"
                        download_list.add(query)
    return list(download_list)

def scrape_qobuz_squid(download_list):
    base_url = "https://qobuz.squid.wtf"
    results = {}
    
    # 1. Setup automatic downloading directory
    download_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(download_dir, exist_ok=True)
    print(f"Files will be downloaded to: {download_dir}")

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
    
    print("Launching browser...")
    driver = webdriver.Chrome(options=chrome_options)
    wait = WebDriverWait(driver, 15) # Increased wait time slightly for safety
    
    try:
        # Load the base website ONCE
        driver.get(base_url)
        time.sleep(2) # Let the initial React/Vue app load
        
        for item in download_list:
            print(f"Searching for: {item}")
            
            try:
                # --- NEW: SEARCH BOX INTERACTION ---
                # Find the search input using the ID from your HTML
                search_box = wait.until(EC.element_to_be_clickable((By.ID, "search")))
                
                # Clear the search box (important for the 2nd, 3rd, 4th songs)
                # Modern web apps sometimes ignore .clear(), so we simulate Ctrl+A then Backspace
                search_box.send_keys(Keys.CONTROL + "a")
                search_box.send_keys(Keys.BACKSPACE)
                
                # Type the query and press ENTER
                search_box.send_keys(item)
                search_box.send_keys(Keys.RETURN)
                
                # Give the site a moment to fetch the search results
                time.sleep(3) 

                # --- TARGETING THE DOWNLOAD BUTTON ---
                xpath_selector = "//button[.//svg[contains(@class, 'lucide-download')]]"
                
                download_button = wait.until(
                    EC.element_to_be_clickable((By.XPATH, xpath_selector)) 
                )
                
                # Click the button
                download_button.click()
                print(f"✅ Clicked download for: {item}")
                results[item] = "Success"
                
                # Wait for download to process before searching the next song
                time.sleep(5) 
                
            except Exception as e:
                print(f"❌ Failed processing '{item}'. It might not exist on the site.")
                results[item] = "Failed: Not found or error"
            
    finally:
        print("Waiting 10 seconds for final downloads to finish...")
        time.sleep(10)
        driver.quit()
        
    return results

if __name__ == "__main__":
    json_folder = 'spotify_data' 
    
    if not os.path.exists(json_folder):
        print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs there.")
        exit()
        
    items_to_download = parse_spotify_history(json_folder)
    print(f"Found {len(items_to_download)} unique items to search.")
    
    if not items_to_download:
        print("No valid Spotify streams found.")
        exit()
    
    test_limit = 5
    print(f"\nRunning test on first {test_limit} items...")
    
    scrape_log = scrape_qobuz_squid(items_to_download[:test_limit])
    
    with open('scrape_log.json', 'w', encoding='utf-8') as f:
        json.dump(scrape_log, f, indent=4, ensure_ascii=False)
        
    print("\nScraping complete. Check the 'downloads' folder!")