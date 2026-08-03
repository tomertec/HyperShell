import { useStore } from "zustand";
import type { LayoutTab } from "./layoutStore";
import { LocalProfileIcon } from "../local/LocalProfileIcon";
import { localProfilesStore } from "../local/localProfilesStore";

function stateTint(sessionState: string | undefined, isActive: boolean): string {
  switch (sessionState) {
    case "connected":
      return isActive ? "text-text-primary" : "text-text-secondary";
    case "connecting":
    case "reconnecting":
      return "text-warning animate-pulse";
    case "waiting_for_network":
      return "text-warning";
    case "failed":
      return "text-danger";
    default:
      return "text-text-muted/50";
  }
}

function TransportGlyph({ tab }: { tab: LayoutTab }) {
  if (tab.type === "sftp") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 4.5A1.5 1.5 0 013.5 3H6.5L8 5H12.5A1.5 1.5 0 0114 6.5V11.5A1.5 1.5 0 0112.5 13H3.5A1.5 1.5 0 012 11.5V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tab.transport === "serial") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5 2V7M11 2V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3.5 7H12.5V9A4.5 4.5 0 018 13.5V13.5A4.5 4.5 0 013.5 9V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 13.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  // ssh, telnet, and anything else terminal-shaped
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10.5H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TabIcon({
  tab,
  sessionState,
  isActive,
}: {
  tab: LayoutTab;
  sessionState: string | undefined;
  isActive: boolean;
}) {
  const profiles = useStore(localProfilesStore, (s) => s.profiles);
  const tint = stateTint(sessionState, isActive);
  const localProfile =
    tab.transport === "local" && tab.profileId
      ? profiles.find((p) => p.id === tab.profileId)
      : undefined;

  return (
    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${tint}`}>
      {localProfile ? (
        <LocalProfileIcon icon={localProfile.icon} className="h-3.5 w-3.5" />
      ) : (
        <TransportGlyph tab={tab} />
      )}
    </span>
  );
}
