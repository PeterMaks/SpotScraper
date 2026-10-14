// Compatibility wrapper re-exporting from tauriBridge
export * from '../utils/tauriBridge';
export { isTauriDesktop as isTauri } from '../utils/tauriBridge';
export { notifyDesktop as sendDesktopNotification } from '../utils/tauriBridge';
export { showInFileExplorer as revealInExplorer } from '../utils/tauriBridge';
export { pickDownloadDirectoryNative as openNativeFolderDialog } from '../utils/tauriBridge';
export { pickAndImportStreamingFilesNative as openNativeFileDialog } from '../utils/tauriBridge';
