import { randomUUID } from "node:crypto";
import {
  ipcChannels,
  getLocalProfileEnvVarsRequestSchema,
  removeLocalProfileRequestSchema,
  reorderLocalProfilesRequestSchema,
  setLocalProfileHiddenRequestSchema,
  upsertLocalProfileRequestSchema,
  type LocalProfileEnvVar,
  type LocalProfileRecord
} from "@hypershell/shared";
import { createDefaultProbes, detectLocalShells } from "@hypershell/session-core";
import type { createLocalProfilesRepositoryFromDatabase } from "@hypershell/db";
import { reconcileLocalProfiles } from "../localShells/reconcileLocalProfiles";
import type { IpcMainLike } from "./registerIpc";

type LocalProfilesRepo = ReturnType<typeof createLocalProfilesRepositoryFromDatabase>;

function toRecord(profile: ReturnType<LocalProfilesRepo["list"]>[number]): LocalProfileRecord {
  return {
    id: profile.id,
    name: profile.name,
    executable: profile.executable,
    args: profile.args,
    startingDirectory: profile.startingDirectory,
    icon: profile.icon,
    color: profile.color,
    elevated: profile.elevated,
    source: profile.source,
    detectKey: profile.detectKey,
    isAvailable: profile.isAvailable,
    isHidden: profile.isHidden,
    sortOrder: profile.sortOrder
  };
}

/** Runs detection and folds the result into the store. Safe to call repeatedly. */
export function runLocalShellDetection(repo: LocalProfilesRepo): void {
  const detected = detectLocalShells(createDefaultProbes());
  reconcileLocalProfiles(repo, detected, () => randomUUID());
}

export function registerLocalProfilesIpc(
  ipcMain: IpcMainLike,
  getRepo: () => LocalProfilesRepo
): void {
  ipcMain.handle(ipcChannels.localProfiles.list, async (): Promise<LocalProfileRecord[]> => {
    return getRepo().list().map(toRecord);
  });

  ipcMain.handle(
    ipcChannels.localProfiles.upsert,
    async (_event: unknown, request: unknown): Promise<LocalProfileRecord> => {
      const parsed = upsertLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      const created = repo.create({
        id: parsed.id,
        name: parsed.name,
        executable: parsed.executable,
        args: parsed.args ?? existing?.args ?? [],
        startingDirectory: parsed.startingDirectory ?? existing?.startingDirectory ?? null,
        icon: parsed.icon ?? existing?.icon ?? "terminal",
        color: parsed.color ?? existing?.color ?? null,
        elevated: parsed.elevated ?? existing?.elevated ?? false,
        // Source and detect key are owned by detection, never by the renderer.
        source: existing?.source ?? "user",
        detectKey: existing?.detectKey ?? null,
        isAvailable: existing?.isAvailable ?? true,
        isHidden: existing?.isHidden ?? false,
        sortOrder: parsed.sortOrder ?? existing?.sortOrder ?? 0
      });

      if (parsed.envVars) {
        repo.replaceEnvVars(parsed.id, parsed.envVars);
      }

      return toRecord(created);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.remove,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = removeLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      if (!existing) {
        return;
      }

      // Deleting a detected profile outright would let the next detection pass
      // re-insert it, so hide it instead — the tombstone reconciliation respects.
      if (existing.source === "detected") {
        repo.setHidden(parsed.id, true);
        return;
      }

      repo.remove(parsed.id);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.setHidden,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = setLocalProfileHiddenRequestSchema.parse(request);
      getRepo().setHidden(parsed.id, parsed.hidden);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.reorder,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = reorderLocalProfilesRequestSchema.parse(request);
      getRepo().reorder(parsed.items);
    }
  );

  ipcMain.handle(ipcChannels.localProfiles.rescan, async (): Promise<LocalProfileRecord[]> => {
    const repo = getRepo();
    runLocalShellDetection(repo);
    return repo.list().map(toRecord);
  });

  ipcMain.handle(
    ipcChannels.localProfiles.getEnvVars,
    async (_event: unknown, request: unknown): Promise<LocalProfileEnvVar[]> => {
      const parsed = getLocalProfileEnvVarsRequestSchema.parse(request);
      return getRepo().listEnvVars(parsed.id);
    }
  );
}
