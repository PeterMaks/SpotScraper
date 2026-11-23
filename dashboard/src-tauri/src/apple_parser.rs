pub use crate::spotify_parser::{
    DailyTrendPoint, DayHours, RankedItem, StreamingStats, TimePeriodHours, TimelinePoint,
};
use chrono::{DateTime, Datelike, NaiveDate, Timelike};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Deserialize)]
struct LibraryTrack {
    #[serde(rename = "Title")]
    title: Option<String>,
    #[serde(rename = "Artist")]
    artist: Option<String>,
    #[serde(rename = "Album")]
    album: Option<String>,
    #[serde(rename = "Genre")]
    genre: Option<String>,
}

fn load_apple_library_meta(dirs: &[std::path::PathBuf]) -> HashMap<String, (String, String)> {
    let mut map = HashMap::new();
    for dir in dirs {
        let candidates = [
            dir.join("Apple Music Library Tracks.json"),
            dir.join("jsons").join("Apple Music Library Tracks.json"),
        ];

        for path in &candidates {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(path) {
                    if let Ok(tracks) = serde_json::from_str::<Vec<LibraryTrack>>(&content) {
                        for t in tracks {
                            if let Some(title) = t.title {
                                let title_clean = title.trim().to_lowercase();
                                let artist_clean = t
                                    .artist
                                    .unwrap_or_else(|| "Unknown Artist".to_string())
                                    .trim()
                                    .to_lowercase();
                                let album = t
                                    .album
                                    .unwrap_or_else(|| "Unknown Album".to_string())
                                    .trim()
                                    .to_string();
                                let genre = t
                                    .genre
                                    .unwrap_or_else(|| "Unknown Genre".to_string())
                                    .trim()
                                    .to_string();

                                map.insert(format!("{} - {}", artist_clean, title_clean), (album.clone(), genre.clone()));
                                map.entry(title_clean).or_insert((album, genre));
                            }
                        }
                    }
                }
            }
        }
    }
    map
}

pub fn compute_apple_stats(data_dir: &Path) -> Result<StreamingStats, String> {
    let mut dirs_to_scan = vec![data_dir.to_path_buf()];
    if let Some(parent) = data_dir.parent() {
        let alt = parent.join("apple_music_data");
        if alt.exists() && alt != data_dir {
            dirs_to_scan.push(alt);
        }
        let alt2 = parent.join("apple_data");
        if alt2.exists() && alt2 != data_dir && !dirs_to_scan.contains(&alt2) {
            dirs_to_scan.push(alt2);
        }
    }

    let meta_map = load_apple_library_meta(&dirs_to_scan);

    let mut csv_files: Vec<_> = Vec::new();
    for dir in &dirs_to_scan {
        if dir.exists() {
            let files: Vec<_> = WalkDir::new(dir)
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
            csv_files.extend(files);
        }
    }
    csv_files.sort();
    csv_files.dedup();

    let mut total_music_ms = 0u64;
    let mut total_plays = 0u64;
    let mut skipped_count = 0u64;

    let mut track_map: HashMap<(String, String), (u64, u64, String)> = HashMap::new();
    let mut artist_map: HashMap<String, (u64, u64)> = HashMap::new();
    let mut album_map: HashMap<(String, String), (u64, u64)> = HashMap::new();
    let mut genre_map: HashMap<String, u64> = HashMap::new();

    let mut hourly_dist = vec![0u64; 24];
    let mut weekday_dist = vec![0u64; 7];
    let mut by_dow_ms = [0u64; 7];
    let mut morning_ms = 0u64;
    let mut afternoon_ms = 0u64;
    let mut evening_ms = 0u64;
    let mut night_ms = 0u64;

    let mut daily_ms_map: HashMap<String, u64> = HashMap::new();
    let mut monthly: HashMap<String, (u64, u64)> = HashMap::new();

    for path in csv_files {
        let mut rdr = match csv::ReaderBuilder::new().flexible(true).from_path(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let headers = match rdr.headers() {
            Ok(h) => h.clone(),
            Err(_) => continue,
        };

        let headers_lower: Vec<String> = headers.iter().map(|h| h.trim().to_lowercase()).collect();

        // Check if format is "Play History Daily Tracks"
        let is_daily_tracks = headers_lower.iter().any(|h| h == "track description")
            && headers_lower.iter().any(|h| h == "date played");

        if is_daily_tracks {
            let desc_idx = headers_lower.iter().position(|h| h == "track description").unwrap();
            let date_idx = headers_lower.iter().position(|h| h == "date played").unwrap();
            let dur_idx = headers_lower.iter().position(|h| h == "play duration milliseconds");
            let hours_idx = headers_lower.iter().position(|h| h == "hours");
            let play_count_idx = headers_lower.iter().position(|h| h == "play count");
            let skip_count_idx = headers_lower.iter().position(|h| h == "skip count");

            for record in rdr.records().flatten() {
                let desc = record.get(desc_idx).unwrap_or("").trim();
                if desc.is_empty() {
                    continue;
                }

                let mut artist = "Unknown Artist".to_string();
                let mut track = desc.to_string();
                if let Some((a, t)) = desc.split_once(" - ") {
                    artist = a.trim().to_string();
                    track = t.trim().to_string();
                }

                let ms: u64 = if let Some(i) = dur_idx {
                    record
                        .get(i)
                        .and_then(|v| v.trim().parse::<f64>().ok())
                        .map(|v| v as u64)
                        .unwrap_or(0)
                } else if let Some(i) = hours_idx {
                    record
                        .get(i)
                        .and_then(|v| v.trim().parse::<f64>().ok())
                        .map(|h| (h * 3_600_000.0) as u64)
                        .unwrap_or(0)
                } else {
                    180_000
                };

                let plays = play_count_idx
                    .and_then(|i| record.get(i))
                    .and_then(|v| v.trim().parse::<u64>().ok())
                    .unwrap_or(1);
                let skips = skip_count_idx
                    .and_then(|i| record.get(i))
                    .and_then(|v| v.trim().parse::<u64>().ok())
                    .unwrap_or(0);

                total_plays += plays;
                skipped_count += skips;
                total_music_ms += ms;

                let lookup_key = format!("{} - {}", artist.to_lowercase(), track.to_lowercase());
                let (album, genre) = meta_map
                    .get(&lookup_key)
                    .or_else(|| meta_map.get(&track.to_lowercase()))
                    .cloned()
                    .unwrap_or_else(|| ("Unknown Album".to_string(), "Unknown Genre".to_string()));

                if album != "Unknown Album" {
                    let al_entry = album_map.entry((album.clone(), artist.clone())).or_insert((0, 0));
                    al_entry.0 += plays;
                    al_entry.1 += ms;
                }
                if genre != "Unknown Genre" {
                    *genre_map.entry(genre).or_insert(0) += ms;
                }

                let t_entry = track_map.entry((track.clone(), artist.clone())).or_insert((0, 0, album));
                t_entry.0 += plays;
                t_entry.1 += ms;

                let a_entry = artist_map.entry(artist.clone()).or_insert((0, 0));
                a_entry.0 += plays;
                a_entry.1 += ms;

                // Date parsing (e.g. 20260315 or 2026-03-15)
                if let Some(date_raw) = record.get(date_idx) {
                    let d_clean = date_raw.trim().replace('-', "");
                    if d_clean.len() == 8 {
                        let y = &d_clean[0..4];
                        let m = &d_clean[4..6];
                        let d = &d_clean[6..8];
                        let date_str = format!("{}-{}-{}", y, m, d);
                        *daily_ms_map.entry(date_str.clone()).or_insert(0) += ms;

                        let ym = format!("{}-{}", y, m);
                        let m_entry = monthly.entry(ym).or_insert((0, 0));
                        m_entry.0 += plays;
                        m_entry.1 += ms;

                        if let Ok(nd) = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                            let dow = nd.weekday().num_days_from_sunday() as usize;
                            if dow < 7 {
                                weekday_dist[dow] += plays;
                                by_dow_ms[dow] += ms;
                            }
                        }
                    }
                }
            }
        } else {
            // Standard "Apple Music Play Activity.csv"
            let song_idx = headers_lower.iter().position(|h| h == "song name" || h == "track description");
            let artist_idx = headers_lower.iter().position(|h| h == "artist name");
            let album_idx = headers_lower.iter().position(|h| h == "container name" || h == "album name");
            let ms_idx = headers_lower.iter().position(|h| h == "play duration milliseconds");
            let ts_idx = headers_lower.iter().position(|h| h == "event end timestamp" || h == "event start timestamp");

            let Some(s_idx) = song_idx else { continue };

            for record in rdr.records().flatten() {
                let track = record.get(s_idx).unwrap_or("").trim().to_string();
                if track.is_empty() {
                    continue;
                }

                let ms: u64 = ms_idx
                    .and_then(|i| record.get(i))
                    .and_then(|v| v.trim().parse::<f64>().ok())
                    .map(|v| v as u64)
                    .unwrap_or(0);
                if ms < 30_000 {
                    continue;
                }

                let artist = artist_idx
                    .and_then(|i| record.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Unknown Artist".to_string());

                let album = album_idx
                    .and_then(|i| record.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Unknown Album".to_string());

                total_plays += 1;
                total_music_ms += ms;

                let t_entry = track_map.entry((track.clone(), artist.clone())).or_insert((0, 0, album.clone()));
                t_entry.0 += 1;
                t_entry.1 += ms;

                let a_entry = artist_map.entry(artist.clone()).or_insert((0, 0));
                a_entry.0 += 1;
                a_entry.1 += ms;

                if album != "Unknown Album" {
                    let al_entry = album_map.entry((album, artist.clone())).or_insert((0, 0));
                    al_entry.0 += 1;
                    al_entry.1 += ms;
                }

                if let Some(ts_raw) = ts_idx.and_then(|i| record.get(i)) {
                    if let Ok(dt) = DateTime::parse_from_rfc3339(ts_raw.trim()) {
                        let h = dt.hour() as usize;
                        let dow = dt.weekday().num_days_from_sunday() as usize;
                        let ym = format!("{:04}-{:02}", dt.year(), dt.month());
                        let date_str = format!("{:04}-{:02}-{:02}", dt.year(), dt.month(), dt.day());

                        if h < 24 {
                            hourly_dist[h] += 1;
                            if h >= 5 && h < 12 {
                                morning_ms += ms;
                            } else if h >= 12 && h < 17 {
                                afternoon_ms += ms;
                            } else if h >= 17 && h < 21 {
                                evening_ms += ms;
                            } else {
                                night_ms += ms;
                            }
                        }
                        if dow < 7 {
                            weekday_dist[dow] += 1;
                            by_dow_ms[dow] += ms;
                        }
                        *daily_ms_map.entry(date_str).or_insert(0) += ms;
                        let m_entry = monthly.entry(ym).or_insert((0, 0));
                        m_entry.0 += 1;
                        m_entry.1 += ms;
                    }
                }
            }
        }
    }

    let ms_to_hours = |ms: u64| (ms as f64 / 3_600_000.0 * 10.0).round() / 10.0;
    let ms_to_mins = |ms: u64| (ms as f64 / 60_000.0 * 10.0).round() / 10.0;

    let total_hours = ms_to_hours(total_music_ms);
    let total_minutes = ms_to_mins(total_music_ms);

    let mut top_tracks: Vec<RankedItem> = track_map
        .into_iter()
        .map(|((name, artist), (count, ms, album))| RankedItem {
            name,
            artist: Some(artist),
            album: Some(album),
            play_count: count,
            total_ms: ms,
            total_minutes: ms_to_mins(ms),
            hours: ms_to_hours(ms),
            uri: None,
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

    Ok(StreamingStats {
        total_streams: total_plays,
        total_ms: total_music_ms,
        total_minutes,
        total_hours,
        total_music_hours: total_hours,
        total_podcast_hours: 0.0,
        unique_tracks: top_tracks.len(),
        unique_artists: top_artists.len(),
        unique_albums: top_albums.len(),
        unique_podcasts: 0,
        total_plays,
        skipped_count,
        max_streak,
        avg_daily_hours,
        top_tracks,
        top_artists,
        top_albums,
        top_podcasts: Vec::new(),
        top_genres,
        hourly_distribution: hourly_dist,
        weekday_distribution: weekday_dist,
        listening_by_day,
        listening_by_time,
        daily_trend,
        monthly_timeline,
    })
}
