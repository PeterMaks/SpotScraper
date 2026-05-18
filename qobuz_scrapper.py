import json
import os
import time
import urllib.parse
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def parse_spotify_history(json_directory):
    """
    Parses the Spotify Extended Streaming History JSONs to create a unique list 
    of media.
    """
    download_list = set()
    
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
                    track = stream.get("master_metadata_track_name")
                    artist = stream.get("master_metadata_album_artist_name")
                    
                    if track and artist:
                        # Cleaning up the query to get better search results
                        query = f"{track} {artist}"
                        download_list.add(query)
                            
    return list(download_list)

def scrape_qobuz_squid(download_list):
    """
    Uses Selenium to search and scrape https://qobuz.squid.wtf/
    """
    base_url = "https://qobuz.squid.wtf"
    results = {}
    
    # Setup Chrome options for Selenium
    chrome_options = Options()
    # Uncomment the line below to run the browser invisibly in the background
    # chrome_options.add_argument("--headless") 
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    # Initialize the browser
    print("Launching browser...")
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        for item in download_list:
            print(f"Searching for: {item}")
            
            # Formulate the URL. 
            # Note: You may need to change "/search?q=" depending on how the site formats its search URLs
            query_encoded = urllib.parse.quote_plus(item)
            search_url = f"{base_url}/search?q={query_encoded}" 
            
            driver.get(search_url)
            
            try:
                # --- CRITICAL SELECTOR CONFIGURATION ---
                # The script waits up to 10 seconds for the download button/link to appear.
                # You MUST inspect the site to find the correct CSS Selector for the download element.
                # Replace 'a.download-btn' with the actual class of the download button.
                
                wait = WebDriverWait(driver, 10)
                download_element = wait.until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "a.download-btn")) 
                )
                
                link = download_element.get_attribute('href')
                results[item] = link
                print(f"Found: {link}")
                
            except Exception as e:
                print(f"Could not find download link for '{item}'.")
                results[item] = "Not found or error."
            
            # Be polite to the server and avoid immediate rate-limiting
            time.sleep(2)
            
    finally:
        driver.quit()
        
    return results

if __name__ == "__main__":
    json_folder = 'spotify_data' 
    
    if not os.path.exists(json_folder):
        print(f"Please create a folder named '{json_folder}' and put your Spotify JSONs there.")
        exit()
        
    items_to_download = parse_spotify_history(json_folder)
    print(f"Found {len(items_to_download)} unique items to download.")
    
    if not items_to_download:
        print("No valid Spotify streams found. Check your JSON format.")
        exit()
    
    # Run scraper on first 5 items as a test
    test_limit = 5
    print(f"\nRunning scraper on first {test_limit} items as a test...")
    download_links = scrape_qobuz_squid(items_to_download[:test_limit])
    
    with open('qobuz_links.json', 'w', encoding='utf-8') as f:
        json.dump(download_links, f, indent=4, ensure_ascii=False)
        
    print("\nScraping complete. Results saved to 'qobuz_links.json'.")