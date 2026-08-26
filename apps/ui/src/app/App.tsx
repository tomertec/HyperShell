import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { toast, Toaster } from "sonner";
import { getShell, hasShell } from "../lib/shell";

import { broadcastStore } from "../features/broadcast/broadcastStore";
import { useSnippetStore } from "../features/snippets/snippetStore";
import type { HostFormValue } from "../features/hosts/HostForm";
import { HostForm, ENV_VAR_NAME_REGEX } from "../features/hosts/HostForm";
import type { HostRecord } from "../features/hosts/HostsView";
import {
  SshConfigImportDialog,
  type SshConfigImportItem
} from "../features/hosts/SshConfigImportDialog";
import { PuttyImportDialog } from "../features/hosts/PuttyImportDialog";
import { SshManagerImportDialog } from "../features/hosts/SshManagerImportDialog";
import { ConnectionHistoryDialog } from "../features/hosts/ConnectionHistoryDialog";
import { AppShell } from "../features/layout/AppShell";
import { Modal } from "../features/layout/Modal";
import { Workspace } from "../features/layout/Workspace";
import {
  layoutStore,
  restorableWorkspaceTabs,
  serializeWorkspaceLayout,
  workspaceTabToLayoutTab,
} from "../features/layout/layoutStore";
import { handlePaneShortcut } from "../features/layout/paneShortcuts";
import { localProfilesStore, selectLaunchableProfiles } from "../features/local/localProfilesStore";
import { LocalProfileForm } from "../features/local/LocalProfileForm";
import { QuickConnectDialog } from "../features/quick-connect/QuickConnectDialog";
import type { QuickConnectProfile } from "../features/quick-connect/searchIndex";
import { SerialProfileForm, type SerialProfileFormValue } from "../features/serial/SerialProfileForm";
import { sessionRecoveryStore } from "../features/sessions/sessionRecoveryStore";
import { SessionRecoveryDialog } from "../features/sessions/SessionRecoveryDialog";
import {
  isRestorableSavedSession,
  savedSessionToLayoutTab,
} from "../features/sessions/savedSessionRestore";
import { Sidebar } from "../features/sidebar/Sidebar";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { settingsStore } from "../features/settings/settingsStore";
import { appThemeVariant, resolveAppTheme } from "../features/settings/appThemes";
import { TransferPopup } from "../features/sftp/components/TransferPopup";
import { startTransferEventCoordinator } from "../features/sftp/transferEventCoordinator";
import { resolveTerminalTheme } from "../features/terminal/terminalTheme";
import { syncGhosttySettingsToMain } from "../features/terminal/ghosttyConfigSync";
import { DEFAULT_RECONNECT_BASE_INTERVAL, DEFAULT_RECONNECT_MAX_ATTEMPTS } from "@hypershell/shared";
import type {
  ConnectionHistoryRecord,
  LocalProfileEnvVar,
  LocalProfileRecord,
  SavedSessionRecord,
  PuttySession,
  SerialProfileRecord,
  TagRecord,
  WorkspaceTab,
} from "@hypershell/shared";
import { EditorApp } from "../features/editor/EditorApp";
import { TelnetQuickConnect } from "../features/telnet/TelnetQuickConnect";
import { ConnectionChallengeDialogs } from "../features/connection/ConnectionChallengeDialogs";
import {
  answerKeyboardInteractive,
  connectSftpWithChallenges,
  pickTmuxSession,
} from "../features/connection/connectionChallengeFlows";
import { CommandPalette } from "../features/command-palette/CommandPalette";
import { useCommandPaletteStore } from "../features/command-palette/commandPaletteStore";
import { createCommands, type CommandContext } from "../features/command-palette/commandRegistry";
import type { Command } from "../features/command-palette/searchCommands";
import { useTunnelStore } from "../features/tunnels/tunnelStore";
import { useUpdateStore } from "../features/updates/updateStore";


function normalizeHostEnvVars(
  envVars: HostFormValue["envVars"] | undefined
): HostFormValue["envVars"] {
  if (!Array.isArray(envVars)) {
    return [];
  }

  return envVars
    .map((item, index) => ({
      id: item.id,
      name: item.name.trim(),
      value: item.value ?? "",
      isEnabled: item.isEnabled ?? true,
      sortOrder: index,
    }))
    .filter((item) => item.name.length > 0 && ENV_VAR_NAME_REGEX.test(item.name));
}

function mapDbHostToUiHost(h: Record<string, unknown>): HostRecord {
  return {
    id: String(h.id ?? ""),
    name: String(h.name ?? ""),
    hostname: String(h.hostname ?? ""),
    port: Number(h.port ?? 22),
    username: h.username == null ? "" : String(h.username),
    identityFile: h.identityFile == null ? "" : String(h.identityFile),
    hostProfileId: h.hostProfileId == null ? "" : String(h.hostProfileId),
    envVars: [],
    group: h.group == null ? "" : String(h.group),
    tags: "",
    tagIds: [],
    authMethod: (h.authMethod as HostRecord["authMethod"]) ?? "default",
    agentKind: (h.agentKind as HostRecord["agentKind"]) ?? "system",
    opReference: h.opReference == null ? "" : String(h.opReference),
    notes: h.notes ? String(h.notes) : undefined,
    isFavorite: Boolean(h.isFavorite ?? (h as Record<string, unknown>).is_favorite ?? false),
    sortOrder: h.sortOrder != null ? Number(h.sortOrder) : null,
    color: h.color ? String(h.color) : null,
    proxyJump: h.proxyJump == null ? "" : String(h.proxyJump),
    proxyJumpHostIds: h.proxyJumpHostIds == null ? "" : String(h.proxyJumpHostIds),
    keepAliveInterval:
      h.keepAliveInterval == null ? "" : String(h.keepAliveInterval),
    autoReconnect: Boolean(h.autoReconnect ?? false),
    tmuxDetect: Boolean(h.tmuxDetect ?? false),
    shellIntegration: Boolean(h.shellIntegration ?? true),
    reconnectMaxAttempts:
      h.reconnectMaxAttempts == null ? DEFAULT_RECONNECT_MAX_ATTEMPTS : Number(h.reconnectMaxAttempts),
    reconnectBaseInterval:
      h.reconnectBaseInterval == null ? DEFAULT_RECONNECT_BASE_INTERVAL : Number(h.reconnectBaseInterval),
    password: "",
    savePassword: false,
    clearSavedPassword: false,
    hasSavedPassword:
      ((h.authMethod as string | undefined) ?? "default") === "password" &&
      h.authProfileId != null,
    passwordSavedAt:
      typeof h.passwordSavedAt === "string" ? h.passwordSavedAt : null
  };
}

async function loadHosts(): Promise<HostRecord[]> {
  if (!hasShell()) {
    console.warn("[hypershell] preload bridge not available — skipping host list");
    return [];
  }
  try {
    const dbHosts = await getShell().listHosts();
    return dbHosts.map((h: Record<string, unknown>) => mapDbHostToUiHost(h));
  } catch (err) {
    console.error("[hypershell] failed to load hosts:", err);
    return [];
  }
}

async function loadSerialProfiles(): Promise<SerialProfileRecord[]> {
  if (!hasShell()) {
    return [];
  }
  try {
    return await getShell().listSerialProfiles();
  } catch (err) {
    console.error("[hypershell] failed to load serial profiles:", err);
    return [];
  }
}

async function loadTags(): Promise<TagRecord[]> {
  if (!hasShell()) {
    return [];
  }
  try {
    return await getShell().listTags();
  } catch (err) {
    console.error("[hypershell] failed to load tags:", err);
    return [];
  }
}

async function attachHostTags(hosts: HostRecord[]): Promise<HostRecord[]> {
  if (!hasShell()) {
    return hosts.map((host) => ({
      ...host,
      tagIds: host.tagIds ?? [],
      tags: host.tags ?? "",
    }));
  }

  const hostTagsById = await Promise.all(
    hosts.map(async (host) => {
      try {
        const hostTags = await getShell().tagsGetHostTags({
          hostId: host.id,
        });
        const safeHostTags = hostTags ?? [];
        return {
          hostId: host.id,
          tagIds: safeHostTags.map((tag) => tag.id),
          tags: safeHostTags.map((tag) => tag.name).join(", "),
        };
      } catch {
        return {
          hostId: host.id,
          tagIds: [] as string[],
          tags: "",
        };
      }
    })
  );

  const map = new Map(
    hostTagsById.map((item) => [item.hostId, { tagIds: item.tagIds, tags: item.tags }])
  );

  return hosts.map((host) => {
    const hostTags = map.get(host.id);
    return {
      ...host,
      tagIds: hostTags?.tagIds ?? [],
      tags: hostTags?.tags ?? "",
    };
  });
}

async function persistSerialProfile(profile: SerialProfileRecord): Promise<void> {
  if (!hasShell()) return;
  try {
    await getShell().upsertSerialProfile(profile);
  } catch (err) {
    console.error("[hypershell] failed to persist serial profile:", err);
  }
}

async function persistHost(host: HostRecord): Promise<HostRecord | null> {
  if (!hasShell()) {
    console.warn("[hypershell] upsertHost not available");
    return null;
  }
  try {
    const authMethod = host.authMethod ?? "default";
    const agentKind = host.agentKind ?? "system";
    const opReference = host.opReference ?? "";
    const proxyJump = host.proxyJump ?? "";
    const proxyJumpHostIds = host.proxyJumpHostIds ?? "";
    const autoReconnect = host.autoReconnect ?? false;
    const reconnectMaxAttempts = host.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS;
    const reconnectBaseInterval = host.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL;
    const tmuxDetect = host.tmuxDetect ?? false;
    const shellIntegration = host.shellIntegration ?? true;

    const keepAliveSource =
      typeof host.keepAliveInterval === "string" ? host.keepAliveInterval : "";
    const trimmedKeepAlive = keepAliveSource.trim();
    const parsedKeepAlive =
      trimmedKeepAlive.length === 0 ? null : Number.parseInt(trimmedKeepAlive, 10);
    const keepAliveInterval =
      parsedKeepAlive == null || Number.isNaN(parsedKeepAlive)
        ? null
        : Math.max(0, parsedKeepAlive);

    const savePassword = authMethod === "password" && host.savePassword;
    const clearSavedPassword =
      authMethod !== "password" || host.clearSavedPassword;
    const password = host.password ?? "";
    const hasPasswordForSave = password.trim().length > 0;

    const result = await getShell().upsertHost({
      id: host.id,
      name: host.name,
      hostname: host.hostname,
      port: host.port,
      username: host.username || null,
      identityFile: host.identityFile || null,
      hostProfileId: host.hostProfileId || null,
      group: host.group,
      tags: host.tags,
      notes: host.notes || null,
      authMethod,
      agentKind,
      opReference: opReference || null,
      isFavorite: host.isFavorite ?? false,
      color: host.color ?? null,
      sortOrder: host.sortOrder ?? null,
      proxyJump: proxyJump || null,
      proxyJumpHostIds: proxyJumpHostIds || null,
      keepAliveInterval,
      autoReconnect,
      reconnectMaxAttempts,
      reconnectBaseInterval,
      tmuxDetect,
      shellIntegration,
      savePassword,
      clearSavedPassword,
      ...(savePassword && hasPasswordForSave
        ? { password }
        : {})
    });
    return mapDbHostToUiHost(result as unknown as Record<string, unknown>);
  } catch (err) {
    console.error("[hypershell] failed to persist host:", err);
    return null;
  }
}

function toSerialFormInitialValue(
  profile: SerialProfileRecord | null
): Partial<SerialProfileFormValue> | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    name: profile.name,
    path: profile.path,
    baudRate: profile.baudRate,
    dataBits: profile.dataBits as 5 | 6 | 7 | 8,
    stopBits: profile.stopBits as 1 | 2,
    parity: profile.parity,
    flowControl: profile.flowControl,
    localEcho: profile.localEcho,
    dtr: profile.dtr,
    rts: profile.rts
  };
}

function useAppTheme() {
  const appTheme = useStore(settingsStore, (s) => s.settings.appearance.appTheme);

  useEffect(() => {
    function apply() {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const id = resolveAppTheme(appTheme, prefersDark);
      const variant = appThemeVariant(id);
      document.documentElement.dataset.theme = id;
      document.documentElement.dataset.variant = variant;
      void getShell().setAppTheme(variant);
    }

    apply();

    if (appTheme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [appTheme]);
}

function MainApp() {
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [puttyImportOpen, setPuttyImportOpen] = useState(false);
  const [sshManagerImportOpen, setSshManagerImportOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null);
  const [serialProfiles, setSerialProfiles] = useState<SerialProfileRecord[]>([]);
  const [serialModalOpen, setSerialModalOpen] = useState(false);
  const [editingSerial, setEditingSerial] = useState<SerialProfileRecord | null>(null);
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [connectingHostIds, setConnectingHostIds] = useState<Set<string>>(() => new Set());
  const [lastConnectedAtByHostId, setLastConnectedAtByHostId] = useState<Record<string, string | null>>({});
  const [connectionHistoryHost, setConnectionHistoryHost] = useState<HostRecord | null>(null);
  const [restoreBannerVisible, setRestoreBannerVisible] = useState(false);
  const [lastWorkspaceTabs, setLastWorkspaceTabs] = useState<WorkspaceTab[]>([]);
  const [sessionRecoveryOpen, setSessionRecoveryOpen] = useState(false);
  const [localProfileModalOpen, setLocalProfileModalOpen] = useState(false);
  const [editingLocalProfile, setEditingLocalProfile] = useState<LocalProfileRecord | null>(null);
  const [editingLocalProfileEnvVars, setEditingLocalProfileEnvVars] = useState<LocalProfileEnvVar[]>([]);
  const [editingLocalProfileEnvVarsLoaded, setEditingLocalProfileEnvVarsLoaded] = useState(true);
  const [telnetDialogOpen, setTelnetDialogOpen] = useState(false);
  const tmuxProbeGenRef = useRef(0);
  const backupRestoreInFlightRef = useRef(false);
  const [savedRecoverySessions, setSavedRecoverySessions] = useState<SavedSessionRecord[]>([]);

  const openTab = useStore(layoutStore, (s) => s.openTab);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const terminalThemeName = useStore(
    settingsStore,
    (s) => s.settings.terminal.theme
  );
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
  const toggleBroadcast = useStore(broadcastStore, (s) => s.toggle);
  const isBroadcastEnabled = useStore(broadcastStore, (s) => s.enabled);
  const setBroadcastTargets = useStore(broadcastStore, (s) => s.setTargets);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

  // One transfer-event listener for the whole app — SFTP tabs and the transfer
  // popup subscribe to it instead of the IPC bridge.
  useEffect(() => startTransferEventCoordinator(), []);

  // Terminal settings reach the native surfaces only as a ghostty config blob.
  // Subscribed here, above every terminal pane, so the first push lands before
  // any surface is created.
  useEffect(() => syncGhosttySettingsToMain(settingsStore), []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([loadHosts(), loadSerialProfiles(), loadTags()]).then(
      async ([h, sp, loadedTags]) => {
        const hostsWithTags = await attachHostTags(h);
        if (cancelled) {
          return;
        }
        setHosts(hostsWithTags);
        setSerialProfiles(sp);
        setTags(loadedTags);
      }
    );
    // Settings first: both the restore banner and the recovery prompt are
    // opt-out, and asking before the stored values are known would show them
    // once on every start regardless. One load serves both checks.
    const settingsLoaded = settingsStore.getState().load();

    void settingsLoaded.then(() => {
      if (!settingsStore.getState().settings.general.showRestoreBanner) return;
      return getShell().workspaceLoadLast().then((last) => {
        // Filter here rather than at restore time so the banner's count never
        // promises tabs that cannot come back.
        const restorable = restorableWorkspaceTabs(last?.layout?.tabs ?? []);
        if (restorable.length > 0) {
          setLastWorkspaceTabs(restorable);
          setRestoreBannerVisible(true);
        }
      });
    }).catch(() => {});

    void settingsLoaded
      .then(() => {
        if (!settingsStore.getState().settings.general.showSessionRecoveryPrompt) {
          return;
        }
        return getShell().sessionLoadSavedState().then((sessions) => {
          // Same rule as the banner above: list only what Restore can actually
          // reopen, so the dialog never promises a row that silently vanishes.
          const restorable = sessions.filter(isRestorableSavedSession);
          if (restorable.length === 0) {
            return;
          }
          setSavedRecoverySessions(restorable);
          setSessionRecoveryOpen(true);
        });
      })
      .catch((error) => {
        console.warn("[hypershell] failed loading saved session recovery state:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void localProfilesStore.getState().load();
  }, []);

  const refreshConnectionHistorySummary = useCallback(async () => {
    if (!hasShell()) {
      return;
    }

    try {
      const recent: ConnectionHistoryRecord[] =
        await getShell().connectionHistoryListRecent({ limit: 1000 });
      const next: Record<string, string | null> = {};
      for (const host of hosts) {
        next[host.id] = null;
      }
      for (const item of recent) {
        if (!item.hostId || !item.wasSuccessful) {
          continue;
        }
        const current = next[item.hostId];
        if (!current || Date.parse(item.connectedAt) > Date.parse(current)) {
          next[item.hostId] = item.connectedAt;
        }
      }
      setLastConnectedAtByHostId(next);
    } catch (err) {
      console.warn("[hypershell] failed to load connection history summary:", err);
    }
  }, [hosts]);

  useEffect(() => {
    void refreshConnectionHistorySummary();
  }, [refreshConnectionHistorySummary]);

  useEffect(() => {
    if (!hasShell()) {
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = getShell().onSessionEvent((event) => {
      const shouldRefresh =
        (event.type === "status" && event.state === "connected") ||
        event.type === "error" ||
        event.type === "exit";
      if (!shouldRefresh) {
        return;
      }
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        void refreshConnectionHistorySummary();
      }, 250);
    });

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      unsubscribe?.();
    };
  }, [refreshConnectionHistorySummary]);

  useEffect(() => {
    const store = useUpdateStore.getState();
    void store.refresh();

    if (!hasShell()) {
      return;
    }
    return getShell().onUpdateState((state) => {
      useUpdateStore.getState().applyState(state);
    });
  }, []);

  // Auto-save workspace on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = layoutStore.getState();
      if (state.tabs.length === 0) return;
      const layout = serializeWorkspaceLayout(state);
      void getShell().workspaceSaveLast(layout);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const tabSessionIds = useMemo(() => tabs.map((t) => t.sessionId), [tabs]);

  const activeSessionHostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      const match = tab.sessionId.match(/^ssh-(.+)-\d+$/);
      if (match) ids.add(match[1]);
      if (tab.hostId) ids.add(tab.hostId);
    }
    return ids;
  }, [tabs]);

  useEffect(() => {
    setConnectingHostIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (activeSessionHostIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeSessionHostIds]);

  useEffect(() => {
    for (const id of tabSessionIds) {
      rememberSession(id);
    }
    setBroadcastTargets(tabSessionIds);
  }, [rememberSession, setBroadcastTargets, tabSessionIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (handlePaneShortcut(layoutStore, e)) {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        return;
      }
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsQuickConnectOpen(true);
      }
      if (e.key.toLowerCase() === "b" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleBroadcast();
      }
      if (e.key === "," && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        useSnippetStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleBroadcast]);

  useEffect(() => {
    return getShell().onQuickConnect(() => {
      setIsQuickConnectOpen(true);
    });
  }, []);

  // Keyboard-interactive auth (2FA) relay
  useEffect(() => {
    return getShell().onKeyboardInteractive((request) => {
      void answerKeyboardInteractive(request);
    });
  }, []);

  useAppTheme();

  useEffect(() => {
    const terminalBg = resolveTerminalTheme(terminalThemeName, customThemes).background;
    document.documentElement.style.setProperty("--terminal-bg", terminalBg);
  }, [terminalThemeName, customThemes]);

  const refreshPorts = useCallback(() => {
    getShell().listSerialPorts()
      .then(ports => setAvailablePorts(ports.map(p => p.path)))
      .catch(console.error);
  }, []);

  const connectSerial = useCallback(
    (profile: SerialProfileRecord) => {
      const sessionId = `serial-${profile.id}-${Date.now()}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: profile.name,
        transport: "serial",
        profileId: profile.id,
        preopened: false
      });
    },
    [openTab]
  );

  const handleConnectLocal = useCallback(
    (profile: LocalProfileRecord) => {
      const sessionId = `local-${profile.id}-${Date.now()}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: profile.name,
        transport: "local",
        profileId: profile.id,
        type: "terminal",
        preopened: false
      });
    },
    [openTab]
  );

  const handleNewLocalProfile = useCallback(() => {
    setEditingLocalProfile(null);
    setEditingLocalProfileEnvVars([]);
    setEditingLocalProfileEnvVarsLoaded(true);
    setLocalProfileModalOpen(true);
  }, []);

  // Fetches the profile's real saved env vars before opening the editor —
  // the form must never submit an empty envVars array for a profile whose
  // existing values it never actually saw (see LocalProfileForm's
  // envVarsLoaded / shouldIncludeEnvVarsInUpsert).
  const handleEditLocalProfile = useCallback((profile: LocalProfileRecord) => {
    void (async () => {
      let envVars: LocalProfileEnvVar[] = [];
      let loaded = false;
      try {
        const result = await getShell().getLocalProfileEnvVars({ id: profile.id });
        if (result) {
          envVars = result;
          loaded = true;
        }
      } catch {
        // Leave loaded = false — the form will refuse to touch env vars on save.
      }
      setEditingLocalProfile(profile);
      setEditingLocalProfileEnvVars(envVars);
      setEditingLocalProfileEnvVarsLoaded(loaded);
      setLocalProfileModalOpen(true);
    })();
  }, []);

  const openHostTab = useCallback(
    (host: HostRecord, tmuxAttachTarget?: string) => {
      setConnectingHostIds((prev) => new Set(prev).add(host.id));
      const optimisticSessionId = `ssh-${host.id}-${Date.now()}`;
      openTab({
        tabKey: optimisticSessionId,
        sessionId: optimisticSessionId,
        title: host.name,
        transport: "ssh",
        // Use stable host id so main process resolves the exact saved host record
        // (auth method, password ref, identity file, proxy jump, keep-alive, etc.).
        profileId: host.id,
        hostId: host.id,
        preopened: false,
        tmuxAttachTarget,
      });
    },
    [openTab]
  );

  const connectHost = useCallback(
    async (host: HostRecord) => {
      // Tmux probe requires non-interactive auth (key-based or agent).
      // Password-only hosts can't authenticate a one-shot SSH command.
      const canProbe = host.tmuxDetect && host.authMethod !== "password" && hasShell();
      if (canProbe) {
        const gen = ++tmuxProbeGenRef.current;
        try {
          const result = await getShell().tmuxProbe({ hostId: host.id });
          // If another probe was started while this one was in-flight, discard
          if (gen !== tmuxProbeGenRef.current) return;
          if (result.sessions.length > 0) {
            const choice = await pickTmuxSession(host, result.sessions);
            // null: superseded by a newer challenge — open nothing.
            if (choice) {
              openHostTab(host, choice.attachTo ?? undefined);
            }
            return;
          }
        } catch {
          if (gen !== tmuxProbeGenRef.current) return;
          // Probe failed — proceed with normal connection
        }
      }
      openHostTab(host);
    },
    [openHostTab]
  );

  const connectSshAdHoc = useCallback(
    (host: string, port: number, username: string, _password: string) => {
      const sessionId = `ssh-adhoc-${Date.now()}`;
      const portSuffix = port !== 22 ? `:${port}` : "";
      const profileId = username ? `${username}@${host}${portSuffix}` : `${host}${portSuffix}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: username ? `${username}@${host}` : host,
        transport: "ssh",
        profileId,
        preopened: false,
      });
    },
    [openTab]
  );

  const connectSerialAdHoc = useCallback(
    (port: string, _baudRate: number) => {
      const sessionId = `serial-adhoc-${Date.now()}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: port,
        transport: "serial",
        profileId: port,
        preopened: false,
      });
    },
    [openTab]
  );

  const connectTelnet = useCallback(
    (opts: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string }) => {
      const sessionId = `telnet-${Date.now()}`;
      const portSuffix = opts.port !== 23 ? `:${opts.port}` : "";
      const title = opts.mode === "raw"
        ? `raw://${opts.hostname}${portSuffix}`
        : `telnet://${opts.hostname}${portSuffix}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title,
        transport: "telnet",
        profileId: `${opts.hostname}:${opts.port}`,
        telnetOptions: opts,
        preopened: false,
      });
      setTelnetDialogOpen(false);
    },
    [openTab]
  );

  const openSftpTab = useCallback(
    (host: HostRecord, sftpSessionId: string) => {
      const tabSessionId = `sftp-tab-${sftpSessionId}`;
      openTab({
        tabKey: tabSessionId,
        sessionId: tabSessionId,
        title: `SFTP: ${host.name}`,
        transport: "sftp",
        type: "sftp",
        sftpSessionId,
        hostId: host.id,
        preopened: true
      });
    },
    [openTab]
  );

  const duplicateHost = useCallback((host: HostRecord) => {
    const newHost: HostRecord = { ...host, id: `host-${Date.now()}`, name: `${host.name} (copy)` };
    setHosts((prev) => [...prev, newHost]);
    void persistHost(newHost).then(async () => {
      if (!hasShell()) {
        return;
      }
      try {
        await getShell().tagsSetHostTags({
          hostId: newHost.id,
          tagIds: newHost.tagIds ?? [],
        });
      } catch (error) {
        console.warn("[hypershell] failed to copy host tags:", error);
      }
    });
  }, []);

  const deleteHost = useCallback(async (host: HostRecord) => {
    setHosts((prev) => prev.filter((h) => h.id !== host.id));
    setConnectionHistoryHost((current) => (current?.id === host.id ? null : current));
    await getShell().removeHost({ id: host.id });
  }, []);

  const toggleFavoriteHost = useCallback(
    (host: HostRecord) => {
      const updated = { ...host, isFavorite: !host.isFavorite };
      setHosts((prev) => prev.map((h) => (h.id === host.id ? updated : h)));
      void persistHost(updated);
    },
    []
  );

  const setHostColor = useCallback((host: HostRecord, color: string | null) => {
    const updated = { ...host, color };
    setHosts((prev) => prev.map((h) => (h.id === host.id ? updated : h)));
    void persistHost(updated);
  }, []);

  const reorderHosts = useCallback((items: Array<{ id: string; sortOrder: number; group: string }>) => {
    setHosts((prev) => {
      const updated = [...prev];
      for (const item of items) {
        const idx = updated.findIndex((h) => h.id === item.id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], sortOrder: item.sortOrder, group: item.group };
        }
      }
      return updated.sort((a, b) =>
        (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)
      );
    });
    void getShell().reorderHosts({
      items: items.map((i) => ({ id: i.id, sortOrder: i.sortOrder, groupId: null, group: i.group }))
    });
  }, []);

  const openSftpHost = useCallback(
    async (host: HostRecord) => {
      const sftpSessionId = await connectSftpWithChallenges(host);
      if (sftpSessionId) {
        openSftpTab(host, sftpSessionId);
      }
    },
    [openSftpTab]
  );

  const clearSavedSessionRecoveryState = useCallback(async () => {
    if (!hasShell()) {
      return;
    }
    try {
      await getShell().sessionClearSavedState();
    } catch (error) {
      console.warn("[hypershell] failed clearing saved session recovery state:", error);
    }
  }, []);

  const restoreSavedSessions = useCallback(async () => {
    for (let index = 0; index < savedRecoverySessions.length; index += 1) {
      const sessionId = `recovery-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      const tab = savedSessionToLayoutTab(savedRecoverySessions[index], sessionId);
      if (tab) {
        openTab(tab);
      }
    }
    setSessionRecoveryOpen(false);
    setSavedRecoverySessions([]);
    await clearSavedSessionRecoveryState();
  }, [clearSavedSessionRecoveryState, openTab, savedRecoverySessions]);

  const dismissSavedSessionRecovery = useCallback(async () => {
    setSessionRecoveryOpen(false);
    setSavedRecoverySessions([]);
    await clearSavedSessionRecoveryState();
  }, [clearSavedSessionRecoveryState]);

  const restoreLastWorkspace = useCallback(() => {
    for (const tab of lastWorkspaceTabs) {
      layoutStore.getState().openTab(
        workspaceTabToLayoutTab(
          tab,
          `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
      );
    }
    setRestoreBannerVisible(false);
  }, [lastWorkspaceTabs]);

  const dismissRestoreBanner = useCallback(() => {
    setRestoreBannerVisible(false);
  }, []);

  const profiles = useMemo<QuickConnectProfile[]>(
    () => [
      ...hosts.map((h) => ({
        id: h.id,
        label: h.name,
        hostname: h.hostname,
        transport: "ssh" as const,
        group: h.group,
        tags: h.tags?.split(",").map((t) => t.trim()) ?? []
      })),
      ...serialProfiles.map((sp) => ({
        id: sp.id,
        label: sp.name,
        hostname: sp.path,
        transport: "serial" as const,
        description: `${sp.baudRate} baud`
      }))
    ],
    [hosts, serialProfiles]
  );

  const localProfiles = useStore(localProfilesStore, (s) => s.profiles);
  const launchableLocalProfiles = useMemo(
    () => selectLaunchableProfiles(localProfiles),
    [localProfiles]
  );

  const paletteCommands = useMemo(() => {
    const ctx: CommandContext = {
      getActiveSessionId: () => layoutStore.getState().activeSessionId,
      getPaneCount: () => layoutStore.getState().panes.length,
      splitPane: (direction) => {
        const sid = layoutStore.getState().activeSessionId;
        if (sid) layoutStore.getState().splitPane(sid, direction);
      },
      closePane: () => {
        const state = layoutStore.getState();
        if (state.panes.length > 1) state.closePane(state.activePaneId);
      },
      activatePrevPane: () => {
        const state = layoutStore.getState();
        const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
        if (idx > 0) state.activatePane(state.panes[idx - 1].paneId);
      },
      activateNextPane: () => {
        const state = layoutStore.getState();
        const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
        if (idx < state.panes.length - 1) state.activatePane(state.panes[idx + 1].paneId);
      },
      isBroadcastEnabled: () => isBroadcastEnabled,
      toggleBroadcast: () => broadcastStore.getState().toggle(),
      openSettings: () => setSettingsOpen(true),
      toggleSnippets: () => useSnippetStore.getState().toggle(),
      openQuickConnect: () => setIsQuickConnectOpen(true),
      openHostModal: () => { setEditingHost(null); setHostModalOpen(true); },
      openImportSshConfig: () => setImportModalOpen(true),
      openImportPutty: () => setPuttyImportOpen(true),
      openImportSshManager: () => setSshManagerImportOpen(true),
      getActiveHost: () => {
        const activeId = layoutStore.getState().activeSessionId;
        const tab = layoutStore.getState().tabs.find((t) => t.sessionId === activeId);
        if (!tab?.hostId) return null;
        const host = hosts.find((h) => h.id === tab.hostId);
        return host ? { id: host.id, name: host.name } : null;
      },
      openSftpForHost: (host) => {
        const fullHost = hosts.find((h) => h.id === host.id);
        if (fullHost) void openSftpHost(fullHost);
      },
      hasActiveSession: () => layoutStore.getState().activeSessionId !== null,
      disconnectActiveSession: () => {
        const sid = layoutStore.getState().activeSessionId;
        if (sid) void getShell().closeSession({ sessionId: sid });
      },
      reconnectActiveSession: () => {
        const state = layoutStore.getState();
        const tab = state.tabs.find((t) => t.sessionId === state.activeSessionId);
        if (tab?.hostId) {
          const host = hosts.find((h) => h.id === tab.hostId);
          if (host) void connectHost(host);
        }
      },
      openWorkspaceMenu: () => {
        window.dispatchEvent(new CustomEvent("hypershell:open-workspace-menu"));
      },
      createBackup: () => {
        void (async () => {
          const filePath = await getShell().fsShowSaveDialog({
            filters: [{ name: "SQLite Database", extensions: ["db"] }],
          });
          if (filePath) void getShell().backupCreate({ filePath });
        })();
      },
      restoreBackup: () => {
        if (backupRestoreInFlightRef.current) {
          return;
        }
        void (async () => {
          backupRestoreInFlightRef.current = true;
          try {
            const filePath = await getShell().backupShowOpenDialog();
            if (!filePath) return;
            const confirmed = window.confirm(
              "Restoring a backup will replace your current database. The app will need to restart. Continue?"
            );
            if (!confirmed) return;
            const result = await getShell().backupRestore({ filePath });
            if (result?.requiresRestart) {
              toast.success("Database restored. Please restart the application.");
            }
          } catch (err) {
            toast.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            backupRestoreInFlightRef.current = false;
          }
        })();
      },
      openKeyManager: () => setSettingsOpen(true),
      reloadWindow: () => window.location.reload(),
      openTunnelManager: () => useTunnelStore.getState().openPanel(),
      openTelnetDialog: () => setTelnetDialogOpen(true),
      openSerialModal: () => { setEditingSerial(null); setSerialModalOpen(true); },
    };
    const localCommands: Command[] = launchableLocalProfiles.map((profile) => ({
      id: `local:${profile.id}`,
      title: `Open local shell: ${profile.name}`,
      category: "Local",
      visible: () => true,
      execute: () => handleConnectLocal(profile),
    }));
    return [...createCommands(ctx), ...localCommands];
  }, [hosts, connectHost, openSftpHost, isBroadcastEnabled, launchableLocalProfiles, handleConnectLocal]);

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            hosts={hosts}
            tags={tags}
            activeSessionHostIds={activeSessionHostIds}
            connectingHostIds={connectingHostIds}
            lastConnectedAtByHostId={lastConnectedAtByHostId}
            onConnectHost={(host) => { void connectHost(host); }}
            onOpenSftpHost={(host) => { void openSftpHost(host); }}
            onOpenConnectionHistory={(host) => setConnectionHistoryHost(host)}
            onEditHost={(host) => { setEditingHost(host); setHostModalOpen(true); }}
            onNewHost={() => { setEditingHost(null); setHostModalOpen(true); }}
            onDuplicateHost={duplicateHost}
            onDeleteHost={(host) => { void deleteHost(host); }}
            onToggleFavoriteHost={toggleFavoriteHost}
            onSetHostColor={setHostColor}
            onReorderHosts={reorderHosts}
            serialProfiles={serialProfiles}
            onConnectSerial={connectSerial}
            onEditSerial={(profile) => { setEditingSerial(profile); setSerialModalOpen(true); }}
            onNewSerial={() => { setEditingSerial(null); setSerialModalOpen(true); }}
            onConnectLocal={handleConnectLocal}
            onNewLocal={handleNewLocalProfile}
            onEditLocal={handleEditLocalProfile}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenTelnet={() => setTelnetDialogOpen(true)}
            onImportSshConfig={() => setImportModalOpen(true)}
            restoreCount={restoreBannerVisible ? lastWorkspaceTabs.length : undefined}
            onRestore={restoreLastWorkspace}
            onDismissRestore={dismissRestoreBanner}
          />
        }
      >
        <Workspace
          availablePorts={availablePorts}
          onRefreshPorts={refreshPorts}
          onConnectSsh={connectSshAdHoc}
          onConnectSerial={connectSerialAdHoc}
          onConnectLocal={handleConnectLocal}
        />
      </AppShell>

      <QuickConnectDialog
        open={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        profiles={profiles}
        onOpenProfile={(profile) => {
          if (profile.transport === "serial") {
            const sp = serialProfiles.find((s) => s.id === profile.id);
            if (sp) connectSerial(sp);
          } else {
            const host = hosts.find((h) => h.id === profile.id);
            if (host) void connectHost(host);
          }
        }}
      />

      <CommandPalette commands={paletteCommands} />

      <TelnetQuickConnect
        open={telnetDialogOpen}
        onClose={() => setTelnetDialogOpen(false)}
        onConnect={connectTelnet}
      />

      <ConnectionChallengeDialogs />

      <Modal
        open={hostModalOpen}
        onClose={() => setHostModalOpen(false)}
        title={editingHost ? `Edit ${editingHost.name}` : "New Host"}
      >
        <HostForm
          key={editingHost?.id ?? "new"}
          initialValue={editingHost ?? undefined}
          submitLabel={editingHost ? "Update host" : "Add host"}
          onTagsChanged={(updatedTags) => setTags(updatedTags)}
          onSubmit={(value: HostFormValue) => {
            const id = editingHost?.id ?? `host-${Date.now()}`;
            const normalizedEnvVars = normalizeHostEnvVars(value.envVars);
            const normalizedTagIds = Array.from(new Set(value.tagIds ?? []));
            const isDuplicate = !editingHost && hosts.some(
              (h) => h.name === value.name || (h.hostname === value.hostname && h.port === value.port)
            );
            if (isDuplicate) {
              setHostModalOpen(false);
              return;
            }
            const record: HostRecord = {
              id,
              ...value,
              tagIds: normalizedTagIds,
              envVars: normalizedEnvVars,
            };
            const nowIso = new Date().toISOString();
            const sanitizedRecord: HostRecord = {
              ...record,
              password: "",
              savePassword: false,
              clearSavedPassword: false,
              hasSavedPassword:
                record.authMethod === "password"
                  ? record.clearSavedPassword
                    ? false
                    : record.savePassword
                      ? true
                      : record.hasSavedPassword
                  : false,
              passwordSavedAt:
                record.authMethod === "password"
                  ? record.clearSavedPassword
                    ? null
                    : record.savePassword && (record.password ?? "").trim().length > 0
                      ? nowIso
                      : record.passwordSavedAt ?? null
                  : null
            };
            if (editingHost) {
              setHosts((prev) =>
                prev.map((h) => (h.id === id ? sanitizedRecord : h))
              );
            } else {
              setHosts((prev) => [...prev, sanitizedRecord]);
            }
            void persistHost(record).then(async (persisted) => {
              if (!persisted) {
                return;
              }
              if (hasShell()) {
                try {
                  await getShell().replaceHostEnvVars({
                    hostId: id,
                    envVars: normalizedEnvVars.map((item) => ({
                      id: item.id,
                      name: item.name,
                      value: item.value,
                      isEnabled: item.isEnabled,
                      sortOrder: item.sortOrder,
                    })),
                  });
                } catch (error) {
                  console.warn("[hypershell] failed to persist host env vars:", error);
                }
              }

              let persistedHostTags: TagRecord[] = [];
              if (hasShell()) {
                try {
                  persistedHostTags = await getShell().tagsSetHostTags({
                    hostId: id,
                    tagIds: normalizedTagIds,
                  });
                } catch (error) {
                  console.warn("[hypershell] failed to persist host tags:", error);
                }
              }

              const persistedTagIds = persistedHostTags.map((tag) => tag.id);
              const persistedTagText = persistedHostTags
                .map((tag) => tag.name)
                .join(", ");

              setHosts((prev) =>
                prev.map((h) =>
                  h.id === id
                    ? {
                        ...persisted,
                        envVars: normalizedEnvVars,
                        tagIds:
                          persistedTagIds.length > 0
                            ? persistedTagIds
                            : normalizedTagIds,
                        tags:
                          persistedTagText.length > 0
                            ? persistedTagText
                            : value.tags,
                      }
                    : h
                )
              );
            });
            setHostModalOpen(false);
          }}
        />
      </Modal>

      <SshConfigImportDialog
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(items: SshConfigImportItem[]) => {
          const newHosts = items.map((item, i) => ({
            id: `imported-${Date.now()}-${i}`,
            name: item.alias,
            hostname: item.hostName ?? item.alias,
            port: item.port ?? 22,
            username: item.user ?? "",
            identityFile: "",
            envVars: [],
            group: "Imported",
            tags: "ssh-config",
            tagIds: [],
            authMethod: "default" as const,
            agentKind: "system" as const,
            opReference: "",
            proxyJump: "",
            proxyJumpHostIds: "",
            keepAliveInterval: "",
            autoReconnect: false,
            reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
            reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
            tmuxDetect: false,
            shellIntegration: true,
          }));
          setHosts((prev) => [...prev, ...newHosts]);
          for (const host of newHosts) {
            void persistHost(host);
          }
          setImportModalOpen(false);
        }}
      />

      <PuttyImportDialog
        open={puttyImportOpen}
        onClose={() => setPuttyImportOpen(false)}
        onImport={(sessions: PuttySession[]) => {
          const newHosts = sessions.map((session, i) => ({
            id: `putty-${Date.now()}-${i}`,
            name: session.name,
            hostname: session.hostname,
            port: session.port,
            username: session.username || "",
            identityFile: session.keyFile || "",
            envVars: [],
            group: "PuTTY Import",
            tags: "putty",
            tagIds: [],
            authMethod: "default" as const,
            agentKind: "system" as const,
            opReference: "",
            proxyJump: "",
            proxyJumpHostIds: "",
            keepAliveInterval: "",
            autoReconnect: false,
            reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
            reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
            tmuxDetect: false,
            shellIntegration: true,
          }));
          setHosts((prev) => [...prev, ...newHosts]);
          for (const host of newHosts) {
            void persistHost(host);
          }
          setPuttyImportOpen(false);
          toast.success(`Imported ${newHosts.length} PuTTY session${newHosts.length === 1 ? "" : "s"}`);
        }}
      />

      <SshManagerImportDialog
        open={sshManagerImportOpen}
        onClose={() => setSshManagerImportOpen(false)}
        onImported={() => {
          setSshManagerImportOpen(false);
          void Promise.all([loadHosts(), loadTags()]).then(
            async ([loadedHosts, loadedTags]) => {
              const hostsWithTags = await attachHostTags(loadedHosts);
              setHosts(hostsWithTags);
              setTags(loadedTags);
            }
          );
        }}
      />


      <Modal
        open={serialModalOpen}
        onClose={() => setSerialModalOpen(false)}
        title={editingSerial ? `Edit ${editingSerial.name}` : "New Serial Profile"}
      >
        <SerialProfileForm
          key={editingSerial?.id ?? "new-serial"}
          initialValue={toSerialFormInitialValue(editingSerial)}
          submitLabel={editingSerial ? "Update profile" : "Add profile"}
          availablePorts={availablePorts}
          onRefreshPorts={refreshPorts}
          onSubmit={(value: SerialProfileFormValue) => {
            const id = editingSerial?.id ?? `serial-${Date.now()}`;
            const record: SerialProfileRecord = {
              id,
              ...value,
              notes: null
            };
            if (editingSerial) {
              setSerialProfiles((prev) =>
                prev.map((p) => (p.id === id ? record : p))
              );
            } else {
              setSerialProfiles((prev) => [...prev, record]);
            }
            void persistSerialProfile(record);
            setSerialModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={localProfileModalOpen}
        onClose={() => setLocalProfileModalOpen(false)}
        title={editingLocalProfile ? `Edit ${editingLocalProfile.name}` : "New Local Profile"}
      >
        <LocalProfileForm
          key={editingLocalProfile?.id ?? "new-local"}
          profile={editingLocalProfile}
          envVars={editingLocalProfileEnvVars}
          envVarsLoaded={editingLocalProfileEnvVarsLoaded}
          onSave={() => setLocalProfileModalOpen(false)}
          onCancel={() => setLocalProfileModalOpen(false)}
          onDelete={() => setLocalProfileModalOpen(false)}
        />
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <SettingsPanel
          onImportSshConfig={() => setImportModalOpen(true)}
          onImportPutty={() => setPuttyImportOpen(true)}
          onImportSshManager={() => setSshManagerImportOpen(true)}
        />
      </Modal>

      <ConnectionHistoryDialog
        open={connectionHistoryHost !== null}
        host={connectionHistoryHost}
        onClose={() => setConnectionHistoryHost(null)}
      />

      <SessionRecoveryDialog
        open={sessionRecoveryOpen}
        sessions={savedRecoverySessions}
        onRestore={restoreSavedSessions}
        onDismiss={dismissSavedSessionRecovery}
      />

      <TransferPopup />

      {/* Native ghostty surfaces sit above CSS z-index by construction
          (they're child HWNDs, not DOM nodes) — a toast anchored over the
          terminal area would render underneath a live surface no matter how
          it's stacked. bottom-left with this offset keeps it over the
          sidebar/status-bar corner, which native surfaces never cover. */}
      <Toaster
        position="bottom-left"
        offset={{ left: "12px", bottom: "36px" }}
        toastOptions={{
          className: "!bg-base-700 !border !border-border !text-text-primary !text-sm",
        }}
      />
    </>
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");
  const sftpSessionId = params.get("sftpSessionId");

  if (windowType === "editor" && sftpSessionId) {
    return <EditorApp sftpSessionId={sftpSessionId} />;
  }

  return <MainApp />;
}
