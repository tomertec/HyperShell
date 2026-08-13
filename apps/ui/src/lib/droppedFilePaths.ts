/**
 * Turning an OS drag-and-drop into usable absolute paths.
 *
 * `File.path` was removed in Electron 32, so the path has to come back through
 * the preload bridge (`webUtils.getPathForFile`). Files with no path on disk —
 * synthesised blobs, dragged text — resolve to "" and are dropped.
 */
export function extractDroppedPaths(dataTransfer: DataTransfer | null): string[] {
  const resolve = window.hypershell?.getPathForFile;
  if (!dataTransfer || !resolve) {
    return [];
  }

  return Array.from(dataTransfer.files)
    .map((file) => resolve(file))
    .filter((path): path is string => Boolean(path));
}

/**
 * Formats paths for insertion as terminal input, matching Windows Terminal:
 * quote only when the path contains a space, separate multiple paths with a
 * single space, and never append a newline (the user presses Enter).
 */
export function formatPathsForTerminal(paths: string[]): string {
  return paths
    .map((path) => (path.includes(" ") ? `"${path}"` : path))
    .join(" ");
}
