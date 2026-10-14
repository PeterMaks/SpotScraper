use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Timelike};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Deserialize)]
struct RawSpotifyRecord {
    ts: Option<String>,
    ms_played: Option<u64>,
    master_metadata_track_name: Option<String>,
    master_metadata_album_artist_name: Option<String>,
    master_metadata_album_album_name: Option<String>,
    spotify_track_uri: Option<String>,
    episode_show_name: Option<String>,
    skipped: Option<bool>,
    // Account data history fields
    #[serde(rename = "endTime")]
    end_time: Option<String>,
    #[serde(rename = "msPlayed")]
    ms_played_alt: Option<u64>,
    #[serde(rename = "trackName")]
    track_name_alt: Option<String>,
    #[serde(rename = "artistName")]
    artist_name_alt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedItem {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    pub play_count: u64,
    pub total_ms: u64,
    pub total_minutes: f64,
    pub hours: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelinePoint {
    pub month: String,
    pub play_count: u64,
    pub total_minutes: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayHours {
    pub day: String,
    pub hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimePeriodHours {
    pub period: String,
    pub hours: f64,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTrendPoint {
    pub date: String,
    pub hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingStats {
    pub total_streams: u64,
    pub total_ms: u64,
    pub total_minutes: f64,
    pub total_hours: f64,
    pub total_music_hours: f64,
    pub total_podcast_hours: f64,
    pub unique_tracks: usize,
    pub unique_artists: usize,
    pub unique_albums: usize,
    pub unique_podcasts: usize,
    pub total_plays: u64,
    pub skipped_count: u64,
    pub max_streak: u64,
    pub avg_daily_hours: f64,
    pub top_tracks: Vec<RankedItem>,
    pub top_artists: Vec<RankedItem>,
    pub top_albums: Vec<RankedItem>,
    pub top_podcasts: Vec<RankedItem>,
    pub top_genres: Vec<RankedItem>,
    pub hourly_distribution: Vec<u64>,
    pub weekday_distribution: Vec<u64>,
    pub listening_by_day: Vec<DayHours>,
    pub listening_by_time: Vec<TimePeriodHours>,
    pub daily_trend: Vec<DailyTrendPoint>,
    pub monthly_timeline: Vec<TimelinePoint>,
}

pub struct NormalizedPlay {
    pub track: String,
    pub artist: String,
    pub album: String,
    pub ms_played: u64,
    pub uri: Option<String>,
    pub podcast: Option<String>,
    pub skipped: bool,
    pub hour: usize,
    pub weekday: usize, // 0 = Sun .. 6 = Sat
    pub year_month: String,
    pub date_str: String,
}

fn parse_timestamp(raw: &str) -> Option<(usize, usize, String, String)> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        let hour = dt.hour() as usize;
        let weekday = dt.weekday().num_days_from_sunday() as usize;
        let ym = format!("{:04}-{:02}", dt.year(), dt.month());
        let date_str = format!("{:04}-{:02}-{:02}", dt.year(), dt.month(), dt.day());
        return Some((hour, weekday, ym, date_str));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M") {
        let hour = ndt.hour() as usize;
        let weekday = ndt.weekday().num_days_from_sunday() as usize;
        let ym = format!("{:04}-{:02}", ndt.year(), ndt.month());
        let date_str = format!("{:04}-{:02}-{:02}", ndt.year(), ndt.month(), ndt.day());
        return Some((hour, weekday, ym, date_str));
    }
    None
}

fn load_track_metadata(data_dir: &Path) -> HashMap<String, Vec<String>> {
    let mut meta = HashMap::new();
    let csv_files: Vec<_> = WalkDir::new(data_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("csv"))
                .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    for path in csv_files {
        let mut rdr = match csv::ReaderBuilder::new().flexible(true).from_path(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let headers = match rdr.headers() {
            Ok(h) => h.clone(),
            Err(_) => continue,
        };
        let uri_idx = headers.iter().position(|h| h.trim().eq_ignore_ascii_case("track uri"));
        let genre_idx = headers.iter().position(|h| h.trim().eq_ignore_ascii_case("genres"));
        if let (Some(u_idx), Some(g_idx)) = (uri_idx, genre_idx) {
            for record in rdr.records().flatten() {
                if let (Some(uri), Some(genres_str)) = (record.get(u_idx), record.get(g_idx)) {
                    let u = uri.trim();
                    if !u.is_empty() {
                        let genres = genres_str
                            .split(',')
                            .map(|g| g.trim().to_string())
                            .filter(|g| !g.is_empty())
                            .collect::<Vec<_>>();
                        if !genres.is_empty() {
                            meta.insert(u.to_string(), genres);
                        }
                    }
                }
            }
        }
    }
    meta
}

fn parse_csv_tracks(data_dir: &Path) -> Vec<NormalizedPlay> {
    let mut plays = Vec::new();
    let csv_files: Vec<_> = WalkDir::new(data_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("csv"))
                .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    for path in csv_files {
        let mut rdr = match csv::ReaderBuilder::new().flexible(true).from_path(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let headers = match rdr.headers() {
            Ok(h) => h.clone(),
            Err(_) => continue,
        };

        let track_idx = headers.iter().position(|h| {
            let l = h.trim().to_lowercase();
            l == "track name" || l == "song" || l == "title" || l == "track"
        });
        let artist_idx = headers.iter().position(|h| {
            let l = h.trim().to_lowercase();
            l == "artist name(s)" || l == "artist name" || l == "artist"
        });
        let album_idx = headers.iter().position(|h| {
            let l = h.trim().to_lowercase();
            l == "album name" || l == "album"
        });
        let dur_idx = headers.iter().position(|h| {
            let l = h.trim().to_lowercase();
            l == "duration (ms)" || l == "duration_ms" || l == "duration"
        });
        let uri_idx = headers.iter().position(|h| {
            let l = h.trim().to_lowercase();
            l == "track uri" || l == "spotify uri" || l == "uri"
        });

        if let (Some(t_idx), Some(a_idx)) = (track_idx, artist_idx) {
            for record in rdr.records().flatten() {
                let track = record.get(t_idx).unwrap_or("").trim().to_string();
                let artist = record.get(a_idx).unwrap_or("").trim().to_string();
                if track.is_empty() || artist.is_empty() {
                    continue;
                }
                let album = album_idx
                    .and_then(|i| record.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Unknown Album".to_string());
                let ms: u64 = dur_idx
                    .and_then(|i| record.get(i))
                    .and_then(|v| v.trim().parse::<f64>().ok())
                    .map(|v| v as u64)
                    .unwrap_or(180_000);
                let uri = uri_idx
                    .and_then(|i| record.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());

                plays.push(NormalizedPlay {
                    track,
                    artist,
                    album,
                    ms_played: ms,
                    uri,
                    podcast: None,
                    skipped: false,
                    hour: 12,
                    weekday: 0,
                    year_month: "Imported".to_string(),
                    date_str: "Imported".to_string(),
                });
            }
        }
    }
    plays
}

pub fn compute_spotify_stats(data_dir: &Path) -> Result<StreamingStats, String> {
    let track_meta = load_track_metadata(data_dir);

    let json_files: Vec<_> = WalkDir::new(data_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    let mut plays: Vec<NormalizedPlay> = json_files
        .par_iter()
        .flat_map(|path| {
            let content = match fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => return Vec::new(),
            };
            let records: Vec<RawSpotifyRecord> = match serde_json::from_str(&content) {
                Ok(r) => r,
                Err(_) => return Vec::new(),
            };
            records
                .into_iter()
                .filter_map(|rec| {
                    let ms = rec.ms_played.or(rec.ms_played_alt).unwrap_or(0);
                    if ms == 0 {
                        return None;
                    }

                    let ts_str = rec.ts.or(rec.end_time).unwrap_or_default();
                    let (hour, weekday, year_month, date_str) = parse_timestamp(&ts_str)
                        .unwrap_or((12, 0, "Unknown".to_string(), "Unknown".to_string()));

                    if let Some(show) = rec.episode_show_name {
                        let show_clean = show.trim().to_string();
                        if !show_clean.is_empty() {
                            return Some(NormalizedPlay {
                                track: String::new(),
                                artist: String::new(),
                                album: String::new(),
                                ms_played: ms,
                                uri: rec.spotify_track_uri,
                                podcast: Some(show_clean),
                                skipped: rec.skipped.unwrap_or(false),
                                hour,
                                weekday,
                                year_month,
                                date_str,
                            });
                        }
                    }

                    let track = rec
                        .master_metadata_track_name
                        .or(rec.track_name_alt)?
                        .trim()
                        .to_string();
                    if track.is_empty() {
                        return None;
                    }
                    let artist = rec
                        .master_metadata_album_artist_name
                        .or(rec.artist_name_alt)
                        .unwrap_or_else(|| "Unknown Artist".to_string())
                        .trim()
                        .to_string();
                    let album = rec
                        .master_metadata_album_album_name
                        .unwrap_or_else(|| "Unknown Album".to_string())
                        .trim()
                        .to_string();

                    Some(NormalizedPlay {
                        track,
                        artist,
                        album,
                        ms_played: ms,
                        uri: rec.spotify_track_uri,
                        podcast: None,
                        skipped: rec.skipped.unwrap_or(false),
                        hour,
                        weekday,
                        year_month,
                        date_str,
                    })
                })
                .collect::<Vec<_>>()
        })
        .collect();

    // If no JSON plays or only a few, incorporate CSV playlist rows
    let csv_plays = parse_csv_tracks(data_dir);
    plays.extend(csv_plays);

    Ok(aggregate_plays(plays, &track_meta))
}

fn aggregate_plays(
    plays: Vec<NormalizedPlay>,
    track_meta: &HashMap<String, Vec<String>>,
) -> StreamingStats {
    let mut total_music_ms = 0u64;
    let mut total_podcast_ms = 0u64;
    let mut total_plays = 0u64;
    let mut skipped_count = 0u64;

    let mut track_map: HashMap<(String, String), (u64, u64, String, Option<String>)> =
        HashMap::new();
    let mut artist_map: HashMap<String, (u64, u64)> = HashMap::new();
    let mut album_map: HashMap<(String, String), (u64, u64)> = HashMap::new();
    let mut podcast_map: HashMap<String, (u64, u64)> = HashMap::new();
    let mut genre_map: HashMap<String, u64> = HashMap::new();

    let mut hourly_dist = vec![0u64; 24];
    let mut weekday_dist = vec![0u64; 7];
    let mut by_dow_ms = [0u64; 7]; // 0=Sun .. 6=Sat
    let mut morning_ms = 0u64;
    let mut afternoon_ms = 0u64;
    let mut evening_ms = 0u64;
    let mut night_ms = 0u64;

    let mut daily_ms_map: HashMap<String, u64> = HashMap::new();
    let mut monthly: HashMap<String, (u64, u64)> = HashMap::new();

    for p in plays {
        total_plays += 1;
        if p.skipped {
            skipped_count += 1;
        }

        if let Some(show) = p.podcast {
            total_podcast_ms += p.ms_played;
            let entry = podcast_map.entry(show).or_insert((0, 0));
            entry.0 += 1;
            entry.1 += p.ms_played;
            continue;
        }

        total_music_ms += p.ms_played;

        if p.hour < 24 {
            hourly_dist[p.hour] += 1;
            if p.hour >= 5 && p.hour < 12 {
                morning_ms += p.ms_played;
            } else if p.hour >= 12 && p.hour < 17 {
                afternoon_ms += p.ms_played;
            } else if p.hour >= 17 && p.hour < 21 {
                evening_ms += p.ms_played;
            } else {
                night_ms += p.ms_played;
            }
        }
        if p.weekday < 7 {
            weekday_dist[p.weekday] += 1;
            by_dow_ms[p.weekday] += p.ms_played;
        }

        if p.date_str != "Unknown" && p.date_str != "Imported" {
            *daily_ms_map.entry(p.date_str.clone()).or_insert(0) += p.ms_played;
        }

        if p.year_month != "Unknown" && p.year_month != "Imported" {
            let entry = monthly.entry(p.year_month).or_insert((0, 0));
            entry.0 += 1;
            entry.1 += p.ms_played;
        }

        let t_entry = track_map
            .entry((p.track.clone(), p.artist.clone()))
            .or_insert((0, 0, p.album.clone(), p.uri.clone()));
        t_entry.0 += 1;
        t_entry.1 += p.ms_played;

        let a_entry = artist_map.entry(p.artist.clone()).or_insert((0, 0));
        a_entry.0 += 1;
        a_entry.1 += p.ms_played;

        if p.album != "Unknown Album" && !p.album.is_empty() {
            let al_entry = album_map.entry((p.album, p.artist)).or_insert((0, 0));
            al_entry.0 += 1;
            al_entry.1 += p.ms_played;
        }

        if let Some(uri) = &p.uri {
            if let Some(genres) = track_meta.get(uri) {
                for g in genres {
                    *genre_map.entry(g.clone()).or_insert(0) += p.ms_played;
                }
            }
        }
    }

    let total_ms = total_music_ms + total_podcast_ms;
    let ms_to_hours = |ms: u64| (ms as f64 / 3_600_000.0 * 10.0).round() / 10.0;
    let ms_to_mins = |ms: u64| (ms as f64 / 60_000.0 * 10.0).round() / 10.0;

    let total_music_hours = ms_to_hours(total_music_ms);
    let total_podcast_hours = ms_to_hours(total_podcast_ms);
    let total_hours = ms_to_hours(total_ms);
    let total_minutes = ms_to_mins(total_ms);

    let mut top_tracks: Vec<RankedItem> = track_map
        .into_iter()
        .map(|((name, artist), (count, ms, album, uri))| RankedItem {
            name,
            artist: Some(artist),
            album: Some(album),
            play_count: count,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri,
        })
        .collect();
    top_tracks.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    top_tracks.truncate(100);

    let mut top_artists: Vec<RankedItem> = artist_map
        .into_iter()
        .map(|(name, (count, ms))| RankedItem {
            name,
            artist: None,
            album: None,
            play_count: count,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri: None,
        })
        .collect();
    top_artists.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    top_artists.truncate(50);

    let mut top_albums: Vec<RankedItem> = album_map
        .into_iter()
        .map(|((name, artist), (count, ms))| RankedItem {
            name,
            artist: Some(artist),
            album: None,
            play_count: count,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri: None,
        })
        .collect();
    top_albums.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    top_albums.truncate(50);

    let mut top_podcasts: Vec<RankedItem> = podcast_map
        .into_iter()
        .map(|(name, (count, ms))| RankedItem {
            name,
            artist: None,
            album: None,
            play_count: count,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri: None,
        })
        .collect();
    top_podcasts.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    top_podcasts.truncate(20);

    let mut top_genres: Vec<RankedItem> = genre_map
        .into_iter()
        .map(|(name, ms)| RankedItem {
            name,
            artist: None,
            album: None,
            play_count: 0,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri: None,
        })
        .collect();
    top_genres.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    top_genres.truncate(20);

    let day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let listening_by_day = day_names
        .iter()
        .enumerate()
        .map(|(i, &day)| DayHours {
            day: day.to_string(),
            hours: ms_to_hours(by_dow_ms[i]),
        })
        .collect();

    let listening_by_time = vec![
        TimePeriodHours {
            period: "Morning".to_string(),
            hours: ms_to_hours(morning_ms),
            fill: "var(--chart-1)".to_string(),
        },
        TimePeriodHours {
            period: "Afternoon".to_string(),
            hours: ms_to_hours(afternoon_ms),
            fill: "var(--chart-2)".to_string(),
        },
        TimePeriodHours {
            period: "Evening".to_string(),
            hours: ms_to_hours(evening_ms),
            fill: "var(--chart-3)".to_string(),
        },
        TimePeriodHours {
            period: "Night".to_string(),
            hours: ms_to_hours(night_ms),
            fill: "var(--chart-4)".to_string(),
        },
    ];

    let mut daily_trend: Vec<DailyTrendPoint> = daily_ms_map
        .iter()
        .map(|(date, &ms)| DailyTrendPoint {
            date: date.clone(),
            hours: ms_to_hours(ms),
        })
        .collect();
    daily_trend.sort_by(|a, b| a.date.cmp(&b.date));

    // Streak calculation
    let mut sorted_dates: Vec<NaiveDate> = daily_ms_map
        .keys()
        .filter_map(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .collect();
    sorted_dates.sort();
    sorted_dates.dedup();

    let mut max_streak = 0u64;
    let mut current_streak = 0u64;
    for i in 0..sorted_dates.len() {
        if i == 0 {
            current_streak = 1;
        } else {
            let diff = (sorted_dates[i] - sorted_dates[i - 1]).num_days();
            if diff == 1 {
                current_streak += 1;
            } else if diff > 1 {
                current_streak = 1;
            }
        }
        if current_streak > max_streak {
            max_streak = current_streak;
        }
    }

    let unique_days = sorted_dates.len();
    let avg_daily_hours = if unique_days > 0 {
        (total_hours / unique_days as f64 * 10.0).round() / 10.0
    } else {
        0.0
    };

    let mut monthly_timeline: Vec<TimelinePoint> = monthly
        .into_iter()
        .map(|(month, (count, ms))| TimelinePoint {
            month,
            play_count: count,
            total_minutes: ms_to_mins(ms),
        })
        .collect();
    monthly_timeline.sort_by(|a, b| a.month.cmp(&b.month));

    StreamingStats {
        total_streams: total_plays,
        total_ms,
        total_minutes,
        total_hours,
        total_music_hours,
        total_podcast_hours,
        unique_tracks: top_tracks.len(),
        unique_artists: top_artists.len(),
        unique_albums: top_albums.len(),
        unique_podcasts: top_podcasts.len(),
        total_plays,
        skipped_count,
        max_streak,
        avg_daily_hours,
        top_tracks,
        top_artists,
        top_albums,
        top_podcasts,
        top_genres,
        hourly_distribution: hourly_dist,
        weekday_distribution: weekday_dist,
        listening_by_day,
        listening_by_time,
        daily_trend,
        monthly_timeline,
    }
}
