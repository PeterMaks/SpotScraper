// Utility for interacting with native desktop capabilities in Tauri v2
// Automatically degrades gracefully when loaded in a standard browser.

export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/**
 * Open a native file selection dialog.
 * @param {Object} options
 * @param {boolean} options.multiple
 * @param {Array<{name: string, extensions: string[]}>} options.filters
 * @returns {Promise<string[]|string|null>}
 */
export async function openNativeFileDialog(options = {}) {
  if (!isTauri()) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    return await open(options);
  } catch (err) {
    console.warn('Native dialog unavailable, falling back:', err);
    return null;
  }
}

/**
 * Open a native folder selection dialog.
 * @returns {Promise<string|null>}
 */
export async function openNativeFolderDialog() {
  if (!isTauri()) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    return await open({ directory: true, multiple: false });
  } catch (err) {
    console.warn('Native folder dialog unavailable:', err);
    return null;
  }
}

/**
 * Send an OS-level notification (e.g. on scrape completion).
 * @param {string} title
 * @param {string} body
 */
export async function sendDesktopNotification(title, body) {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (err) {
    console.warn('Desktop notification failed:', err);
  }
}

/**
 * Reveal or open a file or directory in Windows Explorer.
 * @param {string} targetPath
 */
export async function revealInExplorer(targetPath) {
  if (!isTauri() || !targetPath) return false;
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(targetPath);
    return true;
  } catch (err) {
    console.warn('Failed to open path in Explorer:', err);
    return false;
  }
}

/**
 * Open an external URL in the system's default browser.
 * @param {string} url
 */
export async function openExternalUrl(url) {
  if (!isTauri() || !url) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch (err) {
    console.warn('Failed to open external URL with opener, using window.open:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
