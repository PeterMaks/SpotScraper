use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeOptions {
    pub limit: Option<u32>,
    pub source: Option<String>,
    pub query: Option<String>,
    pub output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScraperStatusPayload {
    pub is_running: bool,
    pub exit_code: Option<i32>,
    pub message: String,
}

pub async fn spawn_scraper_process(
    app: AppHandle,
    options: ScrapeOptions,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    {
        let child_guard = state.scraper_child.lock().await;
        if child_guard.is_some() {
            return Err("A scrape job is already running.".to_string());
        }
    }

    if let Ok(mut logs) = state.scraper_logs.write() {
        logs.clear();
    }

    let data_dir = state.repo_root.to_string_lossy().into_owned();
    let output_dir = options.output_dir.unwrap_or_else(|| {
        state
            .download_dir
            .read()
            .map(|d| d.to_string_lossy().into_owned())
            .unwrap_or_else(|_| {
                state
                    .repo_root
                    .join("downloads")
                    .to_string_lossy()
                    .into_owned()
            })
    });

    let mut args = vec![
        "--data-dir".to_string(),
        data_dir.clone(),
        "--output-dir".to_string(),
        output_dir.clone(),
    ];

    if let Some(limit) = options.limit {
        args.push("--limit".to_string());
        args.push(limit.to_string());
    }
    if let Some(source) = options.source {
        args.push("--source".to_string());
        args.push(source);
    }
    if let Some(query) = options.query {
        if !query.trim().is_empty() {
            args.push("--query".to_string());
            args.push(query);
        }
    }

    let sidecar_command = app
        .shell()
        .sidecar("binaries/spotscraper-engine")
        .or_else(|_| app.shell().sidecar("spotscraper-engine"));

    let (mut rx, child) = match sidecar_command {
        Ok(cmd) => cmd
            .args(&args)
            .env("PYTHONIOENCODING", "utf-8")
            .env("DATA_DIR", &data_dir)
            .env("SPOTSCRAPER_DATA_DIR", &data_dir)
            .env("SPOTSCRAPER_DOWNLOAD_DIR", &output_dir)
            .spawn()
            .map_err(|e| format!("Failed to spawn spotscraper-engine sidecar: {}", e))?,
        Err(_) => {
            let mut py_args = vec![
                "-u".to_string(),
                state.repo_root.join("Scraper.py").to_string_lossy().into_owned(),
            ];
            py_args.extend(args);
            app.shell()
                .command("python")
                .args(&py_args)
                .current_dir(state.repo_root.clone())
                .env("PYTHONIOENCODING", "utf-8")
                .env("DATA_DIR", &data_dir)
                .env("SPOTSCRAPER_DATA_DIR", &data_dir)
                .env("SPOTSCRAPER_DOWNLOAD_DIR", &output_dir)
                .spawn()
                .map_err(|e| format!("Failed to spawn python fallback: {}", e))?
        }
    };

    {
        let mut child_guard = state.scraper_child.lock().await;
        *child_guard = Some(child);
    }

    let _ = app.emit(
        "scraper-status",
        ScraperStatusPayload {
            is_running: true,
            exit_code: None,
            message: "SpotScraper scraper engine started".to_string(),
        },
    );

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).trim_end().to_string();
                    if !line.is_empty() {
                        let st = app_clone.state::<AppState>();
                        st.push_log(line.clone());
                        let _ = app_clone.emit("scraper-log", line);
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).trim_end().to_string();
                    if !line.is_empty() {
                        let formatted = format!("[STDERR] {}", line);
                        let st = app_clone.state::<AppState>();
                        st.push_log(formatted.clone());
                        let _ = app_clone.emit("scraper-log", formatted);
                    }
                }
                CommandEvent::Error(err_msg) => {
                    let formatted = format!("[ERROR] {}", err_msg);
                    let st = app_clone.state::<AppState>();
                    st.push_log(formatted.clone());
                    let _ = app_clone.emit("scraper-log", formatted);
                }
                CommandEvent::Terminated(payload) => {
                    let st = app_clone.state::<AppState>();
                    {
                        let mut guard = st.scraper_child.lock().await;
                        *guard = None;
                    }
                    let _ = app_clone.emit(
                        "scraper-complete",
                        ScraperStatusPayload {
                            is_running: false,
                            exit_code: payload.code,
                            message: "Scrape completed".to_string(),
                        },
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok("Scraper process started".to_string())
}
