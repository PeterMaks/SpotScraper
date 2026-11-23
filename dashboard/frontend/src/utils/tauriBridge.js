import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, ask, message } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Reliable runtime check for Tauri v2 WebView environment.
 */
export const isTauriDesktop = () =>
  typeof window !== "undefined" &&
  Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

/**
 * Normalizes stats from Tauri/Rust backend into the schema expected by Dashboard.jsx
 */
export function normalizeStats(raw) {
  if (!raw) return null;
  const toHours = (item) => {
    if (!item) return item;
    const hours = typeof item.hours === 'number'
      ? item.hours
      : (typeof item.totalMinutes === 'number' ? Math.round((item.totalMinutes / 60) * 10) / 10 : 0);
    return {
      ...item,
      hours,
      playCount: item.playCount || 0,
    };
  };

  const topArtists = (raw.topArtists || []).map(toHours);
  const topTracks = (raw.topTracks || []).map(toHours);
  const topAlbums = (raw.topAlbums || []).map(toHours);
  const topPodcasts = (raw.topPodcasts || []).map(toHours);
  const topGenres = (raw.topGenres || []).map(toHours);

  const listeningByDay = Array.isArray(raw.listeningByDay) && raw.listeningByDay.length > 0
    ? raw.listeningByDay
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => ({
        day,
        hours: Math.round(((raw.weekdayDistribution?.[i] || 0) / 3600000) * 10) / 10,
      }));

  const listeningByTime = Array.isArray(raw.listeningByTime) && raw.listeningByTime.length > 0
    ? raw.listeningByTime
    : [
        { period: "Morning", hours: 0, fill: "hsl(var(--chart-1))" },
        { period: "Afternoon", hours: 0, fill: "hsl(var(--chart-2))" },
        { period: "Evening", hours: 0, fill: "hsl(var(--chart-3))" },
        { period: "Night", hours: 0, fill: "hsl(var(--chart-4))" },
      ];

  const dailyTrend = Array.isArray(raw.dailyTrend)
    ? raw.dailyTrend
    : (raw.monthlyTimeline || []).map(m => ({ date: m.month, hours: m.hours }));

  return {
    ...raw,
    totalHours: typeof raw.totalHours === 'number' ? raw.totalHours : (Math.round(((raw.totalMs || 0) / 3600000) * 10) / 10),
    totalMusicHours: typeof raw.totalMusicHours === 'number' ? raw.totalMusicHours : (typeof raw.totalHours === 'number' ? raw.totalHours : 0),
    totalPodcastHours: typeof raw.totalPodcastHours === 'number' ? raw.totalPodcastHours : 0,
    uniqueArtists: raw.uniqueArtists || 0,
    uniqueTracks: raw.uniqueTracks || 0,
    uniquePodcasts: raw.uniquePodcasts || 0,
    totalPlays: raw.totalPlays || 0,
    skippedCount: raw.skippedCount || 0,
    maxStreak: raw.maxStreak || 0,
    avgDailyHours: raw.avgDailyHours || 0,
    topArtists,
    topTracks,
    topAlbums,
    topPodcasts,
    topGenres,
    listeningByDay,
    listeningByTime,
    dailyTrend,
  };
}

export async function fetchSpotifyStatsNative(forceRefresh = false) {
  const raw = await invoke("get_spotify_stats", { forceRefresh });
  return normalizeStats(raw);
}

export async function fetchAppleStatsNative(forceRefresh = false) {
  const raw = await invoke("get_apple_stats", { forceRefresh });
  return normalizeStats(raw);
}

export async function pickAndImportStreamingFilesNative(target = "spotify") {
  if (!isTauriDesktop()) return 0;
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Streaming History Exports",
        extensions: ["json", "csv", "zip"],
      },
    ],
  });
  if (!selected) return 0;
  const paths = Array.isArray(selected) ? selected : [selected];
  return await invoke("import_streaming_files", { paths, target });
}

export async function pickDownloadDirectoryNative(defaultPath) {
  if (!isTauriDesktop()) return null;
  const selectedDir = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath || undefined,
    title: "Select SpotScraper Download Directory",
  });
  if (typeof selectedDir === "string") {
    await invoke("set_download_directory", { path: selectedDir });
    return selectedDir;
  }
  return null;
}

export async function fetchDownloadsNative() {
  const tracks = await invoke("get_downloads");
  return tracks.map((t) => {
    const secs = Math.round(t.durationSeconds || 0);
    const duration = secs > 0 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : "-";
    return {
      ...t,
      name: t.filename,
      size: t.sizeBytes || 0,
      mtime: (t.modifiedAt || 0) * 1000,
      duration,
      url: t.filePath,
      streamUrl: convertFileSrc(t.filePath),
    };
  });
}

export async function fetchTrackCoverNative(filePath) {
  return await invoke("get_track_cover", { filePath });
}

export async function deleteDownloadNative(filePath) {
  return await invoke("delete_download", { filePath });
}

export async function fetchSourcesNative() {
  return await invoke("get_sources");
}

export async function fetchDetailedLogsNative() {
  return await invoke("get_detailed_logs");
}

export async function deleteLogsBatchNative(queries) {
  return await invoke("delete_logs_batch", { queries });
}

export async function clearAllLogsNative() {
  return await invoke("clear_all_logs");
}

export async function startScraperNative(options = {}) {
  return await invoke("start_scraper", { options });
}

export async function stopScraperNative() {
  return await invoke("stop_scraper");
}

export async function fetchScraperLogsNative() {
  return await invoke("get_scraper_logs");
}

export async function subscribeScraperEvents({ onLog, onComplete, onStatus }) {
  if (!isTauriDesktop()) return () => {};
  const unlistenLog = await listen("scraper-log", (event) => {
    if (onLog) onLog(event.payload);
  });
  const unlistenComplete = await listen("scraper-complete", (event) => {
    if (onComplete) onComplete(event.payload);
  });
  const unlistenStatus = await listen("scraper-status", (event) => {
    if (onStatus) onStatus(event.payload);
  });
  return () => {
    unlistenLog();
    unlistenComplete();
    unlistenStatus();
  };
}

export async function notifyDesktop(title, body) {
  if (!isTauriDesktop()) return false;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
      return true;
    }
  } catch (err) {
    console.warn("Notification error:", err);
  }
  return false;
}

export async function showInFileExplorer(filePath) {
  if (!isTauriDesktop() || !filePath) return false;
  try {
    const resolved = await invoke("reveal_path", { target: filePath }).catch(() => filePath);
    try {
      await revealItemInDir(resolved);
      return true;
    } catch {
      await openPath(resolved);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Checks GitHub Releases (latest.json) for a signed update.
 */
export async function checkForAppUpdates({
  silentIfUpToDate = true,
  onProgress,
} = {}) {
  if (!isTauriDesktop()) return { available: false };
  try {
    const update = await check();
    if (!update) {
      if (!silentIfUpToDate) {
        await message("You are running the latest version of SpotScraper.", {
          title: "No Updates Available",
          kind: "info",
        });
      }
      return { available: false };
    }

    const shouldInstall = await ask(
      `A new version of SpotScraper (v${update.version}) is available! (Current: v${update.currentVersion})`,
      {
        title: `Update Available — SpotScraper v${update.version}`,
        kind: "info",
        okLabel: "Install & Restart",
        cancelLabel: "Later",
      }
    );

    if (!shouldInstall) {
      return { available: true, version: update.version, installed: false };
    }

    let downloaded = 0;
    let contentLength = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength || 0;
          if (onProgress) onProgress({ downloaded: 0, total: contentLength, percent: 0 });
          break;
        case "Progress":
          downloaded += event.data.chunkLength || 0;
          if (onProgress) {
            const percent = contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : 0;
            onProgress({ downloaded, total: contentLength, percent });
          }
          break;
        case "Finished":
          if (onProgress) onProgress({ downloaded: contentLength, total: contentLength, percent: 100 });
          break;
        default:
          break;
      }
    });

    await relaunch();
    return { available: true, version: update.version, installed: true };
  } catch (err) {
    console.error("Auto-updater check failed:", err);
    if (!silentIfUpToDate) {
      await message(`Failed to check for updates:\n${err?.message || err}`, {
        title: "Update Check Error",
        kind: "error",
      });
    }
    return { available: false, error: String(err) };
  }
}
