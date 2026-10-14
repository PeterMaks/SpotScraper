use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedTrack {
    pub filename: String,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: f64,
    pub bitrate_kbps: u32,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub has_cover: bool,
}

fn is_audio_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp3" | "m4a" | "flac" | "wav" | "ogg" | "opus"
            )
        })
        .unwrap_or(false)
}

pub fn scan_downloads_dir(download_dir: &Path) -> Result<Vec<DownloadedTrack>, String> {
    if !download_dir.exists() {
        return Ok(Vec::new());
    }

    let mut tracks = Vec::new();
    for entry in WalkDir::new(download_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || !is_audio_extension(path) {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size_bytes = metadata.len();
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown.mp3")
            .to_string();
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Track")
            .to_string();

        let mut title = stem.clone();
        let mut artist = "Unknown Artist".to_string();
        let mut album = "Unknown Album".to_string();
        let mut duration_seconds = 0.0;
        let mut bitrate_kbps = 0;
        let mut has_cover = false;

        if let Some((parsed_artist, parsed_title)) = stem.split_once(" - ") {
            artist = parsed_artist.trim().to_string();
            title = parsed_title.trim().to_string();
        }

        if let Ok(tagged_file) = Probe::open(path).and_then(|p| p.read()) {
            let props = tagged_file.properties();
            duration_seconds = (props.duration().as_secs_f64() * 10.0).round() / 10.0;
            bitrate_kbps = props.audio_bitrate().unwrap_or(0);

            if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                if let Some(t) = tag.title() {
                    if !t.trim().is_empty() {
                        title = t.trim().to_string();
                    }
                }
                if let Some(a) = tag.artist() {
                    if !a.trim().is_empty() {
                        artist = a.trim().to_string();
                    }
                }
                if let Some(al) = tag.album() {
                    if !al.trim().is_empty() {
                        album = al.trim().to_string();
                    }
                }
                has_cover = !tag.pictures().is_empty();
            }
        }

        tracks.push(DownloadedTrack {
            filename,
            file_path: path.to_string_lossy().into_owned(),
            title,
            artist,
            album,
            duration_seconds,
            bitrate_kbps,
            size_bytes,
            modified_at,
            has_cover,
        });
    }

    tracks.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(tracks)
}

pub fn extract_cover_data_url(file_path: &Path) -> Option<String> {
    let tagged_file = Probe::open(file_path).ok()?.read().ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())?;
    let pic = tag.pictures().first()?;
    let mime = pic
        .mime_type()
        .map(|m| m.as_str())
        .unwrap_or("image/jpeg");
    let encoded = BASE64.encode(pic.data());
    Some(format!("data:{};base64,{}", mime, encoded))
}
