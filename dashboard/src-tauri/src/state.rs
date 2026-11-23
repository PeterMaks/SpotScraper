use crate::apple_parser::StreamingStats as AppleStats;
use crate::spotify_parser::StreamingStats as SpotifyStats;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::Mutex as AsyncMutex;

pub struct AppState {
    pub repo_root: PathBuf,
    pub download_dir: RwLock<PathBuf>,
    pub spotify_cache: RwLock<Option<SpotifyStats>>,
    pub apple_cache: RwLock<Option<AppleStats>>,
    pub cover_cache: RwLock<HashMap<String, Option<String>>>,
    pub scraper_child: Arc<AsyncMutex<Option<CommandChild>>>,
    pub scraper_logs: Arc<RwLock<VecDeque<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let candidate_root = if current_dir.ends_with("src-tauri") {
            current_dir
                .parent()
                .and_then(|p| p.parent())
                .map(PathBuf::from)
                .unwrap_or_else(|| current_dir.clone())
        } else if current_dir.ends_with("dashboard") {
            current_dir
                .parent()
                .map(PathBuf::from)
                .unwrap_or_else(|| current_dir.clone())
        } else {
            current_dir.clone()
        };

        // Check if candidate_root looks like the dev repo AND is writable
        let is_dev_repo = candidate_root.join("Scraper.py").exists()
            || candidate_root.join("dashboard").exists();
        let test_dir = candidate_root.join("spotify_data");
        let repo_root = if is_dev_repo && std::fs::create_dir_all(&test_dir).is_ok() {
            candidate_root
        } else {
            let fallback = std::env::var_os("LOCALAPPDATA")
                .or_else(|| std::env::var_os("APPDATA"))
                .map(|p| PathBuf::from(p).join("SpotScraper"))
                .unwrap_or_else(|| std::env::temp_dir().join("SpotScraper"));
            let _ = std::fs::create_dir_all(&fallback);
            fallback
        };

        let default_downloads = repo_root.join("downloads");
        let _ = std::fs::create_dir_all(&default_downloads);
        let _ = std::fs::create_dir_all(repo_root.join("spotify_data"));
        let _ = std::fs::create_dir_all(repo_root.join("apple_data"));

        Self {
            repo_root,
            download_dir: RwLock::new(default_downloads),
            spotify_cache: RwLock::new(None),
            apple_cache: RwLock::new(None),
            cover_cache: RwLock::new(HashMap::new()),
            scraper_child: Arc::new(AsyncMutex::new(None)),
            scraper_logs: Arc::new(RwLock::new(VecDeque::with_capacity(1000))),
        }
    }

    pub fn push_log(&self, line: String) {
        if let Ok(mut logs) = self.scraper_logs.write() {
            if logs.len() >= 1000 {
                logs.pop_front();
            }
            logs.push_back(line);
        }
    }
}
