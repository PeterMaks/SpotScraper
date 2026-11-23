use csv::{ReaderBuilder, Trim};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTrack {
    pub id: String,
    pub track: String,
    pub artist: String,
    pub artists: Vec<String>,
    pub album: String,
    pub release_date: String,
    pub duration_ms: u64,
    pub added_at: String,
    pub genres: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportSummary {
    pub file_name: String,
    pub imported_tracks: usize,
    pub unique_artists: usize,
    pub unique_genres: usize,
    pub total_hours: f64,
}

fn clean_multiline(val: &str) -> String {
    val.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn parse_spotify_csv_bytes(raw_bytes: &[u8]) -> Result<Vec<ImportedTrack>, String> {
    // Strip UTF-8 BOM (\xEF\xBB\xBF) if present
    let content = std::str::from_utf8(raw_bytes)
        .map_err(|e| format!("Invalid UTF-8 in CSV: {e}"))?
        .trim_start_matches('\u{feff}');

    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(Trim::All)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {e}"))?
        .iter()
        .map(|h| h.trim_start_matches('\u{feff}').trim().to_lowercase())
        .collect();

    let find_col = |names: &[&str]| -> Option<usize> {
        headers.iter().position(|h| names.contains(&h.as_str()))
    };

    let idx_uri = find_col(&["track uri", "uri", "spotify uri", "id"]);
    let idx_track = find_col(&["track name", "track", "song", "title", "name", "song name"]);
    let idx_artist = find_col(&["artist name(s)", "artist name", "artist", "artists", "singer"]);
    let idx_album = find_col(&["album name", "album"]);
    let idx_release = find_col(&["release date", "release_date", "released"]);
    let idx_duration = find_col(&["duration (ms)", "duration_ms", "duration", "ms"]);
    let idx_added_at = find_col(&["added at", "added_at", "timestamp", "date played"]);
    let idx_genres = find_col(&["genres", "genre"]);

    let mut tracks = Vec::new();

    for result in rdr.records() {
        let record = match result {
            Ok(rec) => rec,
            Err(_) => continue,
        };

        let get_field = |idx: Option<usize>| -> String {
            idx.and_then(|i| record.get(i))
                .map(clean_multiline)
                .unwrap_or_default()
        };

        let track = get_field(idx_track);
        if track.is_empty() {
            continue;
        }

        let raw_artist = get_field(idx_artist);
        let artists: Vec<String> = raw_artist
            .split(';')
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect();
        let primary_artist = artists
            .first()
            .cloned()
            .unwrap_or_else(|| "Unknown Artist".to_string());

        let album = {
            let a = get_field(idx_album);
            if a.is_empty() { "Unknown Album".to_string() } else { a }
        };

        let duration_ms: u64 = get_field(idx_duration).parse::<f64>().unwrap_or(0.0) as u64;
        let release_date = get_field(idx_release);
        let added_at = get_field(idx_added_at);

        let genres: Vec<String> = get_field(idx_genres)
            .split(',')
            .map(|g| g.trim().to_lowercase())
            .filter(|g| !g.is_empty())
            .collect();

        let id = {
            let u = get_field(idx_uri);
            if u.is_empty() {
                format!("local:{track}:{primary_artist}")
            } else {
                u
            }
        };

        tracks.push(ImportedTrack {
            id,
            track,
            artist: artists.join(", "),
            artists,
            album,
            release_date,
            duration_ms,
            added_at,
            genres,
        });
    }

    Ok(tracks)
}

#[tauri::command]
pub async fn import_spotify_csv(
    file_name: String,
    raw_bytes: Vec<u8>,
    spotify_data_dir: String,
) -> Result<CsvImportSummary, String> {
    let tracks = parse_spotify_csv_bytes(&raw_bytes)?;
    if tracks.is_empty() {
        return Err("No valid tracks found in CSV file.".to_string());
    }

    let safe_name = PathBuf::from(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();

    let target_dir = PathBuf::from(&spotify_data_dir);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    fs::write(target_dir.join(&safe_name), &raw_bytes).map_err(|e| e.to_string())?;

    let mut artist_set = HashSet::new();
    let mut genre_set = HashSet::new();
    let mut total_ms: u64 = 0;

    for t in &tracks {
        total_ms += t.duration_ms;
        for a in &t.artists {
            artist_set.insert(a.to_lowercase());
        }
        for g in &t.genres {
            genre_set.insert(g.clone());
        }
    }

    let total_hours = ((total_ms as f64 / 3_600_000.0) * 10.0).round() / 10.0;

    Ok(CsvImportSummary {
        file_name: safe_name,
        imported_tracks: tracks.len(),
        unique_artists: artist_set.len(),
        unique_genres: genre_set.len(),
        total_hours,
    })
}
