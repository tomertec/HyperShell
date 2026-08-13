/**
 * Resolves a dropped `File` back to its absolute path on disk.
 *
 * Electron removed the non-standard `File.path` property in v32, so the only
 * way to recover a path from a drag-and-drop is `webUtils.getPathForFile()`,
 * which is available in the preload only. It is injected rather than imported
 * from "electron" here so `createDesktopApi` stays constructible in unit tests
 * without an Electron runtime.
 */
export interface FilePathResolver {
  getPathForFile(file: File): string;
}

export interface FilesApi {
  getPathForFile(file: File): string;
}

export function createFilesApi(resolver: FilePathResolver | null): FilesApi {
  return {
    getPathForFile(file: File): string {
      if (!resolver) {
        return "";
      }

      try {
        return resolver.getPathForFile(file);
      } catch {
        // Blobs and files synthesised in the renderer have no path on disk.
        return "";
      }
    },
  };
}
