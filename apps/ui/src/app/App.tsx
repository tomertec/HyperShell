import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { toast, Toaster } from "sonner";

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
import { layoutStore } from "../features/layout/layoutStore";
import { handlePaneShortcut } from "../features/layout/paneShortcuts";
import { QuickConnectDialog } from "../features/quick-connect/QuickConnectDialog";
import type { QuickConnectProfile } from "../features/quick-connect/searchIndex";
import { SerialProfileForm, type SerialProfileFormValue } from "../features/serial/SerialProfileForm";
import { sessionRecoveryStore } from "../features/sessions/sessionRecoveryStore";
import { SessionRecoveryDialog } from "../features/sessions/SessionRecoveryDialog";
import { Sidebar } from "../features/sidebar/Sidebar";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { settingsStore } from "../features/settings/settingsStore";
import { TransferPopup } from "../features/sftp/components/TransferPopup";
import { resolveTerminalTheme } from "../features/terminal/terminalTheme";
import type {
  ConnectionHistoryRecord,
  SavedSessionRecord,
  PuttySession,
  SerialProfileRecord,
  TagRecord,
} from "@hypershell/shared";
import { EditorApp } from "../features/editor/EditorApp";
import {
  HostKeyVerificationDialog,
  type HostKeyVerificationInfo,
} from "../features/hosts/HostKeyVerificationDialog";
import { KeyboardInteractiveDialog } from "../features/hosts/KeyboardInteractiveDialog";
import type { KeyboardInteractiveRequest } from "@hypershell/shared";


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
    group: "",
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
    reconnectMaxAttempts:
      h.reconnectMaxAttempts == null ? 5 : Number(h.reconnectMaxAttempts),
    reconnectBaseInterval:
      h.reconnectBaseInterval == null ? 1 : Number(h.reconnectBaseInterval),
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
  if (!window.hypershell?.listHosts) {
    console.warn("[hypershell] listHosts not available on window.hypershell");
    return [];
  }
  try {
    const dbHosts = await window.hypershell.listHosts();
    console.log("[hypershell] loaded hosts from DB:", dbHosts.length);
    return dbHosts.map((h: Record<string, unknown>) => mapDbHostToUiHost(h));
  } catch (err) {
    console.error("[hypershell] failed to load hosts:", err);
    return [];
  }
}

async function loadSerialProfiles(): Promise<SerialProfileRecord[]> {
  if (!window.hypershell?.listSerialProfiles) {
    return [];
  }
  try {
    return await window.hypershell.listSerialProfiles();
  } catch (err) {
    console.error("[hypershell] failed to load serial profiles:", err);
    return [];
  }
}

async function loadTags(): Promise<TagRecord[]> {
  if (!window.hypershell?.listTags) {
    return [];
  }
  try {
    return await window.hypershell.listTags();
  } catch (err) {
    console.error("[hypershell] failed to load tags:", err);
    return [];
  }
}

async function attachHostTags(hosts: HostRecord[]): Promise<HostRecord[]> {
  if (!window.hypershell?.tagsGetHostTags) {
    return hosts.map((host) => ({
      ...host,
      tagIds: host.tagIds ?? [],
      tags: host.tags ?? "",
    }));
  }

  const hostTagsById = await Promise.all(
    hosts.map(async (host) => {
      try {
        const hostTags = await window.hypershell?.tagsGetHostTags?.({
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
  if (!window.hypershell?.upsertSerialProfile) return;
  try {
    await window.hypershell.upsertSerialProfile(profile);
  } catch (err) {
    console.error("[hypershell] failed to persist serial profile:", err);
  }
}

async function persistHost(host: HostRecord): Promise<HostRecord | null> {
  if (!window.hypershell?.upsertHost) {
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
    const reconnectMaxAttempts = host.reconnectMaxAttempts ?? 5;
    const reconnectBaseInterval = host.reconnectBaseInterval ?? 1;

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

    const result = await window.hypershell.upsertHost({
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
      savePassword,
      clearSavedPassword,
      ...(savePassword && (host.password ?? "").trim()
        ? { password: (host.password ?? "").trim() }
        : {})
    });
    console.log("[hypershell] persisted host:", result);
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

function serializeCurrentLayout() {
  const state = layoutStore.getState();
  return {
    tabs: state.tabs.map((t) => ({
      transport: t.transport ?? ("ssh" as const),
      profileId: t.profileId ?? t.sessionId,
      title: t.title,
      type: t.type,
      hostId: t.hostId,
    })),
    splitDirection: state.splitDirection,
    paneSizes: state.paneSizes,
    paneCount: state.panes.length,
  };
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
  const [sftpAuthModalOpen, setSftpAuthModalOpen] = useState(false);
  const [sftpAuthHost, setSftpAuthHost] = useState<HostRecord | null>(null);
  const [sftpAuthUsername, setSftpAuthUsername] = useState("");
  const [sftpAuthPassword, setSftpAuthPassword] = useState("");
  const [sftpAuthError, setSftpAuthError] = useState<string | null>(null);
  const [sftpAuthSubmitting, setSftpAuthSubmitting] = useState(false);
  const [connectingHostIds, setConnectingHostIds] = useState<Set<string>>(new Set());
  const [lastConnectedAtByHostId, setLastConnectedAtByHostId] = useState<Record<string, string | null>>({});
  const [connectionHistoryHost, setConnectionHistoryHost] = useState<HostRecord | null>(null);
  const [hostKeyVerifyOpen, setHostKeyVerifyOpen] = useState(false);
  const [hostKeyVerifyInfo, setHostKeyVerifyInfo] = useState<HostKeyVerificationInfo | null>(null);
  const [hostKeyVerifyHost, setHostKeyVerifyHost] = useState<HostRecord | null>(null);
  const [hostKeyVerifyFromAuth, setHostKeyVerifyFromAuth] = useState(false);
  const [kbdInteractiveRequest, setKbdInteractiveRequest] = useState<KeyboardInteractiveRequest | null>(null);
  const [restoreBannerVisible, setRestoreBannerVisible] = useState(false);
  const [lastWorkspaceTabs, setLastWorkspaceTabs] = useState<Array<{
    transport: string;
    profileId: string;
    title: string;
    type?: string;
    hostId?: string;
  }>>([]);
  const [sessionRecoveryOpen, setSessionRecoveryOpen] = useState(false);
  const [savedRecoverySessions, setSavedRecoverySessions] = useState<SavedSessionRecord[]>([]);

  const openTab = useStore(layoutStore, (s) => s.openTab);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const terminalThemeName = useStore(
    settingsStore,
    (s) => s.settings.terminal.theme
  );
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
  const toggleBroadcast = useStore(broadcastStore, (s) => s.toggle);
  const setBroadcastTargets = useStore(broadcastStore, (s) => s.setTargets);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

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
    // Load settings, then check for last workspace to restore
    void settingsStore.getState().load().then(() => {
      if (!settingsStore.getState().settings.general.showRestoreBanner) return;
      return window.hypershell?.workspaceLoadLast?.().then((last) => {
        if (last?.layout?.tabs && last.layout.tabs.length > 0) {
          setLastWorkspaceTabs(last.layout.tabs);
          setRestoreBannerVisible(true);
        }
      });
    }).catch(() => {});

    if (window.hypershell?.sessionLoadSavedState) {
      void window.hypershell
        .sessionLoadSavedState()
        .then((sessions) => {
          if (sessions.length === 0) {
            return;
          }
          setSavedRecoverySessions(sessions);
          setSessionRecoveryOpen(true);
        })
        .catch((error) => {
          console.warn("[hypershell] failed loading saved session recovery state:", error);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshConnectionHistorySummary = useCallback(async () => {
    if (!window.hypershell?.connectionHistoryListRecent) {
      return;
    }

    try {
      const recent: ConnectionHistoryRecord[] =
        await window.hypershell.connectionHistoryListRecent({ limit: 1000 });
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
    if (!window.hypershell?.onSessionEvent) {
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.hypershell.onSessionEvent((event) => {
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

  // Auto-save workspace on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = layoutStore.getState();
      if (state.tabs.length === 0) return;
      const layout = serializeCurrentLayout();
      void window.hypershell?.workspaceSaveLast?.(layout);
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
    return window.hypershell?.onQuickConnect?.(() => {
      setIsQuickConnectOpen(true);
    });
  }, []);

  // Keyboard-interactive auth (2FA) relay
  useEffect(() => {
    return window.hypershell?.onKeyboardInteractive?.((request) => {
      setKbdInteractiveRequest(request);
    });
  }, []);

  const handleKbdInteractiveSubmit = useCallback(
    (requestId: string, responses: string[]) => {
      void window.hypershell?.keyboardInteractiveRespond?.({ requestId, responses });
      setKbdInteractiveRequest(null);
    },
    []
  );

  const handleKbdInteractiveCancel = useCallback(
    (requestId: string) => {
      // Send empty strings for each prompt so the server rejects auth cleanly
      const emptyResponses = (kbdInteractiveRequest?.prompts ?? []).map(() => "");
      void window.hypershell?.keyboardInteractiveRespond?.({ requestId, responses: emptyResponses });
      setKbdInteractiveRequest(null);
    },
    [kbdInteractiveRequest]
  );

  useEffect(() => {
    const terminalBg = resolveTerminalTheme(terminalThemeName, customThemes).background;
    document.documentElement.style.setProperty("--terminal-bg", terminalBg);
  }, [terminalThemeName, customThemes]);

  const refreshPorts = useCallback(() => {
    window.hypershell?.listSerialPorts?.()
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

  const connectHost = useCallback(
    (host: HostRecord) => {
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
        preopened: false
      });
    },
    [openTab]
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

  const closeSftpAuthModal = useCallback(() => {
    setSftpAuthModalOpen(false);
    setSftpAuthHost(null);
    setSftpAuthPassword("");
    setSftpAuthError(null);
    setSftpAuthSubmitting(false);
  }, []);

  const parseHostKeyVerificationError = useCallback(
    (error: unknown): HostKeyVerificationInfo | null => {
      const message = error instanceof Error ? error.message : String(error);
      // Electron wraps IPC errors: "Error invoking remote method '...': ClassName: {json}"
      // Extract the JSON substring from the message
      const jsonStart = message.indexOf("{");
      const jsonEnd = message.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;
      try {
        const parsed = JSON.parse(message.slice(jsonStart, jsonEnd + 1));
        if (parsed && parsed.__hostKeyVerification) {
          return {
            hostname: parsed.hostname,
            port: parsed.port,
            algorithm: parsed.algorithm,
            fingerprint: parsed.fingerprint,
            verificationStatus: parsed.verificationStatus,
            previousFingerprint: parsed.previousFingerprint,
          };
        }
      } catch {
        // Not a host key verification error
      }
      return null;
    },
    []
  );

  const openSftpAuthModal = useCallback(
    (host: HostRecord, errorMessage?: string) => {
      setSftpAuthHost(host);
      setSftpAuthUsername(host.username?.trim() ?? "");
      setSftpAuthPassword("");
      setSftpAuthError(errorMessage ?? null);
      setSftpAuthModalOpen(true);
    },
    []
  );

  const connectSftpWithPassword = useCallback(async () => {
    if (!window.hypershell?.sftpConnect || !sftpAuthHost) {
      return;
    }

    const username = sftpAuthUsername.trim();
    if (!username) {
      setSftpAuthError("Username is required.");
      return;
    }

    setSftpAuthSubmitting(true);
    setSftpAuthError(null);
    try {
      const { sftpSessionId } = await window.hypershell.sftpConnect({
        hostId: sftpAuthHost.id,
        username,
        ...(sftpAuthPassword ? { password: sftpAuthPassword } : {})
      });
      openSftpTab(sftpAuthHost, sftpSessionId);
      closeSftpAuthModal();
    } catch (error) {
      const verifyInfo = parseHostKeyVerificationError(error);
      if (verifyInfo) {
        closeSftpAuthModal();
        setHostKeyVerifyInfo(verifyInfo);
        setHostKeyVerifyHost(sftpAuthHost);
        setHostKeyVerifyFromAuth(true);
        setHostKeyVerifyOpen(true);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setSftpAuthError(message);
    } finally {
      setSftpAuthSubmitting(false);
    }
  }, [
    closeSftpAuthModal,
    openSftpTab,
    parseHostKeyVerificationError,
    sftpAuthHost,
    sftpAuthPassword,
    sftpAuthUsername
  ]);

  const duplicateHost = useCallback((host: HostRecord) => {
    const newHost: HostRecord = { ...host, id: `host-${Date.now()}`, name: `${host.name} (copy)` };
    setHosts((prev) => [...prev, newHost]);
    void persistHost(newHost).then(async () => {
      if (!window.hypershell?.tagsSetHostTags) {
        return;
      }
      try {
        await window.hypershell.tagsSetHostTags({
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
    await window.hypershell?.removeHost?.({ id: host.id });
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
    void window.hypershell?.reorderHosts?.({
      items: items.map((i) => ({ id: i.id, sortOrder: i.sortOrder, groupId: null }))
    });
  }, []);

  const handleHostKeyTrust = useCallback(async () => {
    if (!hostKeyVerifyInfo || !hostKeyVerifyHost || !window.hypershell?.hostFingerprintTrust) {
      setHostKeyVerifyOpen(false);
      return;
    }

    const id = `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await window.hypershell.hostFingerprintTrust({
      id,
      hostname: hostKeyVerifyInfo.hostname,
      port: hostKeyVerifyInfo.port,
      algorithm: hostKeyVerifyInfo.algorithm,
      fingerprint: hostKeyVerifyInfo.fingerprint,
    });

    const host = hostKeyVerifyHost;
    const fromAuth = hostKeyVerifyFromAuth;
    setHostKeyVerifyOpen(false);
    setHostKeyVerifyInfo(null);
    setHostKeyVerifyHost(null);
    setHostKeyVerifyFromAuth(false);

    // Retry the connection now that the key is trusted
    if (fromAuth) {
      // Re-open the auth modal to let the user retry with credentials
      openSftpAuthModal(host);
    } else {
      // Retry the direct connect
      if (!window.hypershell?.sftpConnect) return;
      try {
        const { sftpSessionId } = await window.hypershell.sftpConnect({
          hostId: host.id,
        });
        openSftpTab(host, sftpSessionId);
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        console.warn("[sftp] connect failed after trust, prompting for credentials:", message);
        openSftpAuthModal(host, message);
      }
    }
  }, [hostKeyVerifyInfo, hostKeyVerifyHost, hostKeyVerifyFromAuth, openSftpAuthModal, openSftpTab]);

  const handleHostKeyReject = useCallback(() => {
    setHostKeyVerifyOpen(false);
    setHostKeyVerifyInfo(null);
    setHostKeyVerifyHost(null);
    setHostKeyVerifyFromAuth(false);
  }, []);

  const openSftpHost = useCallback(
    async (host: HostRecord) => {
      if (!window.hypershell?.sftpConnect) {
        return;
      }

      try {
        const { sftpSessionId } = await window.hypershell.sftpConnect({
          hostId: host.id
        });
        openSftpTab(host, sftpSessionId);
      } catch (error) {
        const verifyInfo = parseHostKeyVerificationError(error);
        if (verifyInfo) {
          setHostKeyVerifyInfo(verifyInfo);
          setHostKeyVerifyHost(host);
          setHostKeyVerifyFromAuth(false);
          setHostKeyVerifyOpen(true);
          return;
        }
        const message =
          error instanceof Error ? error.message : String(error);
        console.warn("[sftp] connect failed, prompting for credentials:", message);
        openSftpAuthModal(host, message);
      }
    },
    [openSftpAuthModal, openSftpTab, parseHostKeyVerificationError]
  );

  const clearSavedSessionRecoveryState = useCallback(async () => {
    if (!window.hypershell?.sessionClearSavedState) {
      return;
    }
    try {
      await window.hypershell.sessionClearSavedState();
    } catch (error) {
      console.warn("[hypershell] failed clearing saved session recovery state:", error);
    }
  }, []);

  const restoreSavedSessions = useCallback(async () => {
    for (let index = 0; index < savedRecoverySessions.length; index += 1) {
      const session = savedRecoverySessions[index];
      if (session.transport === "sftp") {
        continue;
      }

      const sessionId = `recovery-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: session.title,
        transport: session.transport === "serial" ? "serial" : "ssh",
        profileId: session.profileId,
        hostId: session.hostId ?? undefined,
        preopened: false,
      });
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
      layoutStore.getState().openTab({
        sessionId: `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: tab.title,
        transport: tab.transport as "ssh" | "serial" | "sftp",
        profileId: tab.profileId,
        type: (tab.type as "terminal" | "sftp") ?? "terminal",
        hostId: tab.hostId,
      });
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
            onConnectHost={connectHost}
            onOpenSftpHost={openSftpHost}
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
            onOpenSettings={() => setSettingsOpen(true)}
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
            if (host) connectHost(host);
          }
        }}
      />

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
              if (window.hypershell?.replaceHostEnvVars) {
                try {
                  await window.hypershell.replaceHostEnvVars({
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
              if (window.hypershell?.tagsSetHostTags) {
                try {
                  persistedHostTags = await window.hypershell.tagsSetHostTags({
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

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import SSH Config"
      >
        <SshConfigImportDialog
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
              reconnectMaxAttempts: 5,
              reconnectBaseInterval: 1,
            }));
            setHosts((prev) => [...prev, ...newHosts]);
            for (const host of newHosts) {
              void persistHost(host);
            }
            setImportModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={puttyImportOpen}
        onClose={() => setPuttyImportOpen(false)}
        title="Import from PuTTY"
      >
        <PuttyImportDialog
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
              reconnectMaxAttempts: 5,
              reconnectBaseInterval: 1,
            }));
            setHosts((prev) => [...prev, ...newHosts]);
            for (const host of newHosts) {
              void persistHost(host);
            }
            setPuttyImportOpen(false);
            toast.success(`Imported ${newHosts.length} PuTTY session${newHosts.length === 1 ? "" : "s"}`);
          }}
        />
      </Modal>

      <Modal
        open={sshManagerImportOpen}
        onClose={() => setSshManagerImportOpen(false)}
        title="Import from SshManager"
      >
        <SshManagerImportDialog
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
      </Modal>

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

      <Modal
        open={sftpAuthModalOpen}
        onClose={closeSftpAuthModal}
        title={sftpAuthHost ? `SFTP Credentials: ${sftpAuthHost.name}` : "SFTP Credentials"}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void connectSftpWithPassword();
          }}
        >
          {sftpAuthHost ? (
            <p className="text-xs text-text-muted">
              Connect to `{sftpAuthHost.hostname}:{sftpAuthHost.port}`
            </p>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Username</span>
            <input
              value={sftpAuthUsername}
              onChange={(event) => setSftpAuthUsername(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
              autoComplete="username"
              disabled={sftpAuthSubmitting}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Password / Key Passphrase</span>
            <input
              type="password"
              value={sftpAuthPassword}
              onChange={(event) => setSftpAuthPassword(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
              autoComplete="current-password"
              disabled={sftpAuthSubmitting}
            />
          </label>

          {sftpAuthError ? (
            <p className="text-xs text-danger">{sftpAuthError}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-base-700/60 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              onClick={closeSftpAuthModal}
              disabled={sftpAuthSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 disabled:opacity-60"
              disabled={sftpAuthSubmitting}
            >
              {sftpAuthSubmitting ? "Connecting..." : "Connect SFTP"}
            </button>
          </div>
        </form>
      </Modal>

      <HostKeyVerificationDialog
        open={hostKeyVerifyOpen}
        info={hostKeyVerifyInfo}
        onTrust={handleHostKeyTrust}
        onReject={handleHostKeyReject}
      />

      <KeyboardInteractiveDialog
        request={kbdInteractiveRequest}
        onSubmit={handleKbdInteractiveSubmit}
        onCancel={handleKbdInteractiveCancel}
      />

      <SessionRecoveryDialog
        open={sessionRecoveryOpen}
        sessions={savedRecoverySessions}
        onRestore={restoreSavedSessions}
        onDismiss={dismissSavedSessionRecovery}
      />

      <TransferPopup />

      <Toaster
        position="bottom-right"
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
