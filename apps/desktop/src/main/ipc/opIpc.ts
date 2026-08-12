import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ipcChannels,
  opListItemsRequestSchema,
  opGetItemFieldsRequestSchema,
} from "@hypershell/shared";
import type { IpcMainLike } from "./registerIpc";
import type { IpcMainInvokeEvent } from "electron";

const execFileAsync = promisify(execFile);

async function runOp(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("op", args, {
      windowsHide: true,
    });
    return stdout;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new Error(
        "1Password CLI (op) not found. Install it from https://1password.com/downloads/command-line/",
        { cause: err }
      );
    }
    throw err;
  }
}

/**
 * `op` is not guaranteed to emit JSON — a sign-in prompt, an update notice or a
 * plain-text error all reach stdout. Surface those as something the renderer can
 * show instead of a bare SyntaxError.
 */
function parseOpJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `1Password CLI returned unreadable output while reading ${what}. Make sure \`op\` is signed in.`,
      { cause: err }
    );
  }
}

function parseOpJsonArray<T>(raw: string, what: string): T[] {
  const parsed = parseOpJson(raw, what);
  if (!Array.isArray(parsed)) {
    throw new Error(`1Password CLI returned unexpected output while reading ${what}.`);
  }
  return parsed as T[];
}

export function registerOpIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.op.listVaults, async () => {
    const raw = await runOp(["vault", "list", "--format=json"]);
    const parsed = parseOpJsonArray<{ id: string; name: string }>(raw, "vaults");
    return parsed.map((v) => ({ id: v.id, name: v.name }));
  });

  ipcMain.handle(
    ipcChannels.op.listItems,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const { vaultId } = opListItemsRequestSchema.parse(request);
      const raw = await runOp(["item", "list", `--vault=${vaultId}`, "--format=json"]);
      const parsed = parseOpJsonArray<{ id: string; title: string; category?: string }>(
        raw,
        "vault items"
      );
      return parsed.map((i) => ({ id: i.id, title: i.title, category: i.category }));
    }
  );

  ipcMain.handle(
    ipcChannels.op.getItemFields,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const { itemId } = opGetItemFieldsRequestSchema.parse(request);
      const raw = await runOp(["item", "get", itemId, "--format=json"]);
      const parsed = parseOpJson(raw, "item fields") as {
        fields?: { id: string; label: string; type?: string }[];
      } | null;
      const fields = parsed?.fields ?? [];
      // Filter out internal/section-only fields (no label = not user-facing)
      return fields
        .filter((f) => f.label)
        .map((f) => ({ id: f.id, label: f.label, type: f.type }));
    }
  );
}
