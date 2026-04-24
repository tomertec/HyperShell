import path from "node:path";

function toComparablePath(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(rootPath);

  const comparableCandidate = toComparablePath(resolvedCandidate);
  const comparableRoot = toComparablePath(resolvedRoot);

  if (comparableCandidate === comparableRoot) {
    return true;
  }

  const rootWithSeparator = comparableRoot.endsWith(path.sep)
    ? comparableRoot
    : `${comparableRoot}${path.sep}`;
  return comparableCandidate.startsWith(rootWithSeparator);
}

export function assertAbsolutePath(filePath: string, message: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error(message);
  }
  return path.resolve(filePath);
}

export function assertNotWindowsDevicePath(resolvedPath: string): void {
  if (process.platform === "win32" && toComparablePath(resolvedPath).startsWith("\\\\.")) {
    throw new Error("Blocked device path");
  }
}

export function assertPathWithinAllowedRoots(
  resolvedPath: string,
  allowedRoots: string[],
  errorMessage: string
): void {
  if (!allowedRoots.some((root) => isPathWithinRoot(resolvedPath, root))) {
    throw new Error(errorMessage);
  }
}
