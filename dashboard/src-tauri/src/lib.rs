pub mod apple_parser;
pub mod downloads;
pub mod importer;
pub mod scraper;
pub mod spotify_parser;
pub mod state;

use downloads::DownloadedTrack;
use scraper::{ScrapeOptions, ScraperStatusPayload};
use spotify_parser::StreamingStats;
use state::AppState;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

#[tauri::command]
fn get_project_root(state: State<'_, AppState>) -> String {
    state.repo_root.to_string_lossy().into_owned()
}

#[tauri::command]
fn check_file_exists(file_path: String) -> bool {
    std::path::Path::new(&file_path).exists()
}

#[tauri::command]
async fn get_spotify_stats(
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<StreamingStats, String> {
    if !force_refresh.unwrap_or(false) {
        if let Ok(cache) = state.spotify_cache.read() {
            if let Some(cached) = cache.as_ref() {
                return Ok(cached.clone());
            }
        }
    }
    let data_dir = state.repo_root.join("spotify_data");
    let stats = tokio::task::spawn_blocking(move || {
        spotify_parser::compute_spotify_stats(&data_dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Ok(mut cache) = state.spotify_cache.write() {
        *cache = Some(stats.clone());
    }
    Ok(stats)
}

#[tauri::command]
async fn get_apple_stats(
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> Result<StreamingStats, String> {
    if !force_refresh.unwrap_or(false) {
        if let Ok(cache) = state.apple_cache.read() {
            if let Some(cached) = cache.as_ref() {
                return Ok(cached.clone());
            }
        }
    }
    let data_dir = {
        let p = state.repo_root.join("apple_data");
        let alt = state.repo_root.join("apple_music_data");
        let has_files = |dir: &PathBuf| {
            dir.is_dir() && std::fs::read_dir(dir).map(|mut it| it.next().is_some()).unwrap_or(false)
        };
        if !has_files(&p) && has_files(&alt) {
            alt
        } else {
            p
        }
    };
    let stats = tokio::task::spawn_blocking(move || {
        apple_parser::compute_apple_stats(&data_dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Ok(mut cache) = state.apple_cache.write() {
        *cache = Some(stats.clone());
    }
    Ok(stats)
}

#[tauri::command]
async fn import_streaming_files(
    paths: Vec<String>,
    target: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let target_dir = if target.eq_ignore_ascii_case("apple") {
        state.repo_root.join("apple_data")
    } else {
        state.repo_root.join("spotify_data")
    };
    let count = tokio::task::spawn_blocking(move || {
        importer::import_files_to_dir(&paths, &target_dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    if target.eq_ignore_ascii_case("apple") {
        if let Ok(mut c) = state.apple_cache.write() {
            *c = None;
        }
    } else if let Ok(mut c) = state.spotify_cache.write() {
        *c = None;
    }
    Ok(count)
}

#[tauri::command]
fn set_download_directory(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    let mut dir_guard = state.download_dir.write().map_err(|e| e.to_string())?;
    *dir_guard = p;
    Ok(path)
}

#[tauri::command]
async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadedTrack>, String> {
    let dir = state
        .download_dir
        .read()
        .map_err(|e| e.to_string())?
        .clone();
    tokio::task::spawn_blocking(move || downloads::scan_downloads_dir(&dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_track_cover(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    if let Ok(cache) = state.cover_cache.read() {
        if let Some(cached) = cache.get(&file_path) {
            return Ok(cached.clone());
        }
    }
    let path_clone = PathBuf::from(&file_path);
    let data_url = tokio::task::spawn_blocking(move || {
        downloads::extract_cover_data_url(&path_clone)
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Ok(mut cache) = state.cover_cache.write() {
        cache.insert(file_path, data_url.clone());
    }
    Ok(data_url)
}

#[tauri::command]
fn delete_download(file_path: String, state: State<'_, AppState>) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        if let Ok(mut cache) = state.cover_cache.write() {
            cache.remove(&file_path);
        }
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
async fn start_scraper(app: AppHandle, options: ScrapeOptions) -> Result<String, String> {
    scraper::spawn_scraper_process(app, options).await
}

#[tauri::command]
async fn stop_scraper(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let mut guard = state.scraper_child.lock().await;
    if let Some(child) = guard.take() {
        let _ = child.kill();
        let _ = app.emit(
            "scraper-complete",
            ScraperStatusPayload {
                is_running: false,
                exit_code: Some(-1),
                message: "Sidecar scraper stopped by user".to_string(),
            },
        );
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn get_scraper_logs(state: State<'_, AppState>) -> Vec<String> {
    state
        .scraper_logs
        .read()
        .map(|logs| logs.iter().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
fn get_sources(state: State<'_, AppState>) -> Vec<String> {
    let dir = state.repo_root.join("spotify_data");
    if !dir.is_dir() {
        return Vec::new();
    }
    let mut sources = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "json" || ext_lower == "csv" || ext_lower == "xlsx" || ext_lower == "xls" {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            sources.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    sources.sort();
    sources
}

#[tauri::command]
fn get_detailed_logs(state: State<'_, AppState>) -> serde_json::Value {
    let dl_path = state.repo_root.join("download_links.json");
    let sl_path = state.repo_root.join("scrape_log.json");

    let dl: serde_json::Value = if dl_path.exists() {
        std::fs::read_to_string(&dl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let sl: serde_json::Value = if sl_path.exists() {
        std::fs::read_to_string(&sl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    serde_json::json!({
        "downloadLinks": dl,
        "scrapeLog": sl
    })
}

#[tauri::command]
fn delete_logs_batch(queries: Vec<String>, state: State<'_, AppState>) -> Result<bool, String> {
    let dl_path = state.repo_root.join("download_links.json");
    let sl_path = state.repo_root.join("scrape_log.json");
    let arc_dl_path = state.repo_root.join("archive_download_links.json");
    let arc_sl_path = state.repo_root.join("archive_scrape_log.json");

    let mut dl: serde_json::Map<String, serde_json::Value> = if dl_path.exists() {
        std::fs::read_to_string(&dl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let mut sl: serde_json::Map<String, serde_json::Value> = if sl_path.exists() {
        std::fs::read_to_string(&sl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let mut arc_dl: serde_json::Map<String, serde_json::Value> = if arc_dl_path.exists() {
        std::fs::read_to_string(&arc_dl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let mut arc_sl: serde_json::Map<String, serde_json::Value> = if arc_sl_path.exists() {
        std::fs::read_to_string(&arc_sl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    for q in &queries {
        if let Some(v) = dl.remove(q) {
            arc_dl.insert(q.clone(), v);
        }
        if let Some(v) = sl.remove(q) {
            arc_sl.insert(q.clone(), v);
        }
    }

    let _ = std::fs::write(&dl_path, serde_json::to_string_pretty(&dl).unwrap_or_default());
    let _ = std::fs::write(&sl_path, serde_json::to_string_pretty(&sl).unwrap_or_default());
    let _ = std::fs::write(&arc_dl_path, serde_json::to_string_pretty(&arc_dl).unwrap_or_default());
    let _ = std::fs::write(&arc_sl_path, serde_json::to_string_pretty(&arc_sl).unwrap_or_default());

    Ok(true)
}

#[tauri::command]
fn clear_all_logs(state: State<'_, AppState>) -> Result<bool, String> {
    let dl_path = state.repo_root.join("download_links.json");
    let sl_path = state.repo_root.join("scrape_log.json");
    let arc_dl_path = state.repo_root.join("archive_download_links.json");
    let arc_sl_path = state.repo_root.join("archive_scrape_log.json");

    let dl: serde_json::Map<String, serde_json::Value> = if dl_path.exists() {
        std::fs::read_to_string(&dl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let sl: serde_json::Map<String, serde_json::Value> = if sl_path.exists() {
        std::fs::read_to_string(&sl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let mut arc_dl: serde_json::Map<String, serde_json::Value> = if arc_dl_path.exists() {
        std::fs::read_to_string(&arc_dl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    let mut arc_sl: serde_json::Map<String, serde_json::Value> = if arc_sl_path.exists() {
        std::fs::read_to_string(&arc_sl_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    for (k, v) in dl {
        arc_dl.insert(k, v);
    }
    for (k, v) in sl {
        arc_sl.insert(k, v);
    }

    let _ = std::fs::write(&dl_path, "{}");
    let _ = std::fs::write(&sl_path, "{}");
    let _ = std::fs::write(&arc_dl_path, serde_json::to_string_pretty(&arc_dl).unwrap_or_default());
    let _ = std::fs::write(&arc_sl_path, serde_json::to_string_pretty(&arc_sl).unwrap_or_default());

    Ok(true)
}

#[tauri::command]
fn reveal_path(target: String, state: State<'_, AppState>) -> Result<PathBuf, String> {
    let download_dir = state
        .download_dir
        .read()
        .map_err(|e| e.to_string())?
        .clone();

    let target_path = PathBuf::from(&target);
    if target_path.is_absolute() {
        Ok(target_path)
    } else if target == "downloads" || target == "downloads/" || target == "downloads\\" {
        Ok(download_dir)
    } else if let Ok(rel) = target_path.strip_prefix("downloads") {
        Ok(download_dir.join(rel))
    } else {
        let candidate = download_dir.join(&target);
        if candidate.exists() {
            Ok(candidate)
        } else {
            Ok(state.repo_root.join(&target))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show SpotScraper", true, None::<&str>)?;
            let update_i = MenuItem::with_id(app, "check_updates", "Check for Updates", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &update_i, &quit_i])?;

            if let Some(icon) = app.default_window_icon().cloned() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "check_updates" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("trigger-update-check", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_project_root,
            check_file_exists,
            get_spotify_stats,
            get_apple_stats,
            import_streaming_files,
            set_download_directory,
            get_downloads,
            get_track_cover,
            delete_download,
            start_scraper,
            stop_scraper,
            get_scraper_logs,
            get_sources,
            get_detailed_logs,
            delete_logs_batch,
            clear_all_logs,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running SpotScraper Tauri application");
}
