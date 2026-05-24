import json
import os
from collections import defaultdict

def generate_spotify_recap(json_directory):
    # Dictionaries to accumulate total milliseconds played
    total_ms_played = 0
    artist_playtime = defaultdict(int)
    track_playtime = defaultdict(int)
    podcast_playtime = defaultdict(int)
    
    print("🎧 Parsing Spotify history files...")
    
    # 1. Read and consolidate all data
    for filename in os.listdir(json_directory):
        if filename.endswith(".json"):
            filepath = os.path.join(json_directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    print(f"Skipping {filename} - Invalid JSON")
                    continue
                
                for stream in data:
                    ms = stream.get("ms_played", 0)
                    total_ms_played += ms
                    
                    track = stream.get("master_metadata_track_name")
                    artist = stream.get("master_metadata_album_artist_name")
                    show = stream.get("episode_show_name")
                    
                    # Group by Music
                    if track and artist:
                        artist_playtime[artist] += ms
                        track_playtime[f"{track} (by {artist})"] += ms
                    # Group by Podcasts
                    elif show:
                        podcast_playtime[show] += ms

    # Helper function to convert milliseconds to hours
    def ms_to_hours(ms):
        return round(ms / (1000 * 60 * 60), 1)

    # 2. Sort the data to find the top results
    top_artists = sorted(artist_playtime.items(), key=lambda x: x[1], reverse=True)[:10]
    top_tracks = sorted(track_playtime.items(), key=lambda x: x[1], reverse=True)[:10]
    top_podcasts = sorted(podcast_playtime.items(), key=lambda x: x[1], reverse=True)[:5]

    total_hours = ms_to_hours(total_ms_played)

    # 3. Print the Console Recap
    print("\n" + "="*50)
    print("🎉 YOUR SPOTIFY ALL-TIME RECAP 🎉")
    print("="*50)
    print(f"⏱️  Total Listening Time: {total_hours:,} Hours")
    print(f"🎵 Total Unique Artists: {len(artist_playtime):,}")
    print(f"🎼 Total Unique Tracks: {len(track_playtime):,}")
    
    print("\n🏆 TOP 10 ARTISTS")
    print("-" * 25)
    for i, (artist, ms) in enumerate(top_artists, 1):
        print(f"{i}. {artist} - {ms_to_hours(ms)} hrs")

    print("\n🎧 TOP 10 TRACKS")
    print("-" * 25)
    for i, (track, ms) in enumerate(top_tracks, 1):
        print(f"{i}. {track} - {ms_to_hours(ms)} hrs")

    if top_podcasts:
        print("\n🎙️ TOP 5 PODCASTS")
        print("-" * 25)
        for i, (show, ms) in enumerate(top_podcasts, 1):
            print(f"{i}. {show} - {ms_to_hours(ms)} hrs")
            
    print("="*50 + "\n")

    # 4. Export consolidated data for frontend usage
    export_data = {
        "metrics": {
            "total_hours": total_hours,
            "unique_artists": len(artist_playtime),
            "unique_tracks": len(track_playtime)
        },
        "top_artists": [{"name": k, "hours": ms_to_hours(v)} for k, v in top_artists],
        "top_tracks": [{"name": k, "hours": ms_to_hours(v)} for k, v in top_tracks],
        "top_podcasts": [{"name": k, "hours": ms_to_hours(v)} for k, v in top_podcasts]
    }
    
    with open("recap_data.json", "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=4, ensure_ascii=False)
        
    print("✅ Saved structured data to 'recap_data.json' for web usage.")

if __name__ == "__main__":
    # Point this to the folder where you unzipped your Spotify JSONs
    json_folder = 'spotify_data' 
    
    if not os.path.exists(json_folder):
        print(f"❌ Could not find folder '{json_folder}'. Please create it and add your JSONs.")
    else:
        generate_spotify_recap(json_folder)