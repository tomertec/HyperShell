import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function isOnePasswordReference(value: string): boolean {
  return value.startsWith("op://");
}

export async function resolveOnePasswordReference(
  reference: string,
  executable = "op"
): Promise<string> {
  if (!isOnePasswordReference(reference)) {
    throw new Error("Expected an op:// reference");
  }

  const { stdout } = await execFileAsync(executable, ["read", reference], {
    windowsHide: true
  });

  return stdout.trimEnd();
}
