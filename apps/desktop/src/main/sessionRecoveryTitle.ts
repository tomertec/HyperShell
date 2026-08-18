import type { SavedSessionTransport } from "@hypershell/db";

/**
 * The name a recovered session is listed under.
 *
 * Recovery rows are written by the main process, which knows a session only by
 * its transport and profile id. For SSH that id resolves to a host; for local
 * it is a `local_profiles` UUID, and without the lookup the recovery dialog
 * lists rows called `1f1f8716-125c-476b-b355-99177abc70e9`. Serial and telnet
 * ids are already readable (a COM port, a `host:port`), so they fall through.
 */
export function resolveSavedSessionTitle(input: {
  transport: SavedSessionTransport;
  profileId: string;
  hostName?: string | null;
  localProfileName?: string | null;
}): string {
  if (input.transport === "local") {
    return input.localProfileName ?? input.profileId;
  }

  return input.hostName ?? input.profileId;
}
