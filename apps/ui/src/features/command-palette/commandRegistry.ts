import type { Command } from "./searchCommands";

export type CommandContext = {
  // Layout
  getActiveSessionId: () => string | null;
  getPaneCount: () => number;
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: () => void;
  activatePrevPane: () => void;
  activateNextPane: () => void;
  // Broadcast
  isBroadcastEnabled: () => boolean;
  toggleBroadcast: () => void;
  // Navigation
  openSettings: () => void;
  toggleSnippets: () => void;
  // Host
  openQuickConnect: () => void;
  openHostModal: () => void;
  openImportSshConfig: () => void;
  openImportPutty: () => void;
  openImportSshManager: () => void;
  // SFTP
  getActiveHost: () => { id: string; name: string } | null;
  openSftpForHost: (host: { id: string; name: string }) => void;
  // Session
  hasActiveSession: () => boolean;
  disconnectActiveSession: () => void;
  reconnectActiveSession: () => void;
  isRecording: () => boolean;
  toggleRecording: () => void;
  // Workspace
  openWorkspaceMenu: () => void;
  // Appearance
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  // Backup
  createBackup: () => void;
  restoreBackup: () => void;
  // SSH Keys
  openKeyManager: () => void;
  generateKey: () => void;
  // Dev/Debug
  toggleDevTools: () => void;
  reloadWindow: () => void;
  // Port Forwarding
  openTunnelManager: () => void;
  // Telnet
  openTelnetDialog: () => void;
  // Serial
  openSerialModal: () => void;
};

export function createCommands(ctx: CommandContext): Command[] {
  return [
    // --- Navigation ---
    {
      id: "nav.settings",
      title: "Open Settings",
      category: "Navigation",
      shortcut: "Ctrl+,",
      visible: () => true,
      execute: () => ctx.openSettings(),
      keywords: ["preferences", "config", "options"],
    },
    {
      id: "nav.snippets",
      title: "Toggle Snippets Panel",
      category: "Navigation",
      shortcut: "Ctrl+Shift+S",
      visible: () => true,
      execute: () => ctx.toggleSnippets(),
      keywords: ["commands", "scripts", "macros"],
    },

    // --- Layout ---
    {
      id: "layout.split-horizontal",
      title: "Split Pane Horizontal",
      category: "Layout",
      shortcut: "Ctrl+Shift+D",
      visible: () => ctx.getActiveSessionId() !== null,
      execute: () => ctx.splitPane("horizontal"),
    },
    {
      id: "layout.split-vertical",
      title: "Split Pane Vertical",
      category: "Layout",
      shortcut: "Ctrl+Shift+E",
      visible: () => ctx.getActiveSessionId() !== null,
      execute: () => ctx.splitPane("vertical"),
    },
    {
      id: "layout.close-pane",
      title: "Close Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+W",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.closePane(),
    },
    {
      id: "layout.prev-pane",
      title: "Previous Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+[",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.activatePrevPane(),
    },
    {
      id: "layout.next-pane",
      title: "Next Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+]",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.activateNextPane(),
    },

    // --- Session ---
    {
      id: "session.disconnect",
      title: "Disconnect Active Session",
      category: "Session",
      visible: () => ctx.hasActiveSession(),
      execute: () => ctx.disconnectActiveSession(),
      keywords: ["close", "end", "stop"],
    },
    {
      id: "session.reconnect",
      title: "Reconnect Active Session",
      category: "Session",
      visible: () => ctx.hasActiveSession(),
      execute: () => ctx.reconnectActiveSession(),
      keywords: ["retry", "reopen"],
    },
    // Recording: hidden until recording state is wired into CommandContext
    // {
    //   id: "session.toggle-recording",
    //   title: ctx.isRecording() ? "Stop Recording" : "Start Recording",
    //   category: "Session",
    //   visible: () => ctx.hasActiveSession(),
    //   execute: () => ctx.toggleRecording(),
    //   keywords: ["log", "capture"],
    // },

    // --- Host ---
    {
      id: "host.connect",
      title: "Connect to Host...",
      category: "Host",
      shortcut: "Ctrl+K",
      visible: () => true,
      execute: () => ctx.openQuickConnect(),
      keywords: ["ssh", "open", "server"],
    },
    {
      id: "host.new",
      title: "New Host",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openHostModal(),
      keywords: ["add", "create"],
    },
    {
      id: "host.import-ssh-config",
      title: "Import SSH Config",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openImportSshConfig(),
      keywords: ["import", "config", "openssh"],
    },
    {
      id: "host.import-putty",
      title: "Import from PuTTY",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openImportPutty(),
      keywords: ["import", "putty", "migrate"],
    },
    {
      id: "host.import-ssh-manager",
      title: "Import from SSH Manager",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openImportSshManager(),
      keywords: ["import", "migrate"],
    },
    {
      id: "host.telnet",
      title: "Telnet / Raw TCP Connect...",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openTelnetDialog(),
      keywords: ["telnet", "raw", "tcp"],
    },
    {
      id: "host.serial",
      title: "New Serial Connection...",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openSerialModal(),
      keywords: ["serial", "com", "uart"],
    },

    // --- SFTP ---
    {
      id: "sftp.open",
      title: "Open SFTP for Active Host",
      category: "SFTP",
      visible: () => ctx.getActiveHost() !== null,
      execute: () => {
        const host = ctx.getActiveHost();
        if (host) ctx.openSftpForHost(host);
      },
      keywords: ["file", "browse", "transfer"],
    },

    // --- Workspace ---
    {
      id: "workspace.manage",
      title: "Manage Workspaces...",
      category: "Workspace",
      visible: () => true,
      execute: () => ctx.openWorkspaceMenu(),
      keywords: ["save", "load", "layout"],
    },

    // --- Port Forwarding ---
    {
      id: "tunnel.manage",
      title: "Manage Port Forwards...",
      category: "Port Forwarding",
      visible: () => true,
      execute: () => ctx.openTunnelManager(),
      keywords: ["tunnel", "forward", "proxy"],
    },

    // --- Broadcast ---
    {
      id: "broadcast.toggle",
      title: ctx.isBroadcastEnabled()
        ? "Disable Broadcast Mode"
        : "Enable Broadcast Mode",
      category: "Broadcast",
      shortcut: "Ctrl+B",
      visible: () => true,
      execute: () => ctx.toggleBroadcast(),
      keywords: ["multi", "all", "send"],
    },

    // --- Appearance ---
    {
      id: "appearance.zoom-in",
      title: "Zoom In (use shortcut)",
      category: "Appearance",
      shortcut: "Ctrl+Shift+=",
      visible: () => true,
      execute: () => ctx.zoomIn(),
      keywords: ["bigger", "enlarge", "scale"],
    },
    {
      id: "appearance.zoom-out",
      title: "Zoom Out (use shortcut)",
      category: "Appearance",
      shortcut: "Ctrl+Shift+-",
      visible: () => true,
      execute: () => ctx.zoomOut(),
      keywords: ["smaller", "shrink", "scale"],
    },
    {
      id: "appearance.zoom-reset",
      title: "Reset Zoom (use shortcut)",
      category: "Appearance",
      shortcut: "Ctrl+Shift+0",
      visible: () => true,
      execute: () => ctx.resetZoom(),
      keywords: ["default", "100%", "scale"],
    },

    // --- Backup ---
    {
      id: "backup.create",
      title: "Create Backup",
      category: "Backup",
      visible: () => true,
      execute: () => ctx.createBackup(),
      keywords: ["export", "save", "snapshot"],
    },
    {
      id: "backup.restore",
      title: "Restore Backup...",
      category: "Backup",
      visible: () => true,
      execute: () => ctx.restoreBackup(),
      keywords: ["import", "load", "recover"],
    },

    // --- SSH Keys ---
    {
      id: "keys.manage",
      title: "Open Settings (SSH Keys)",
      category: "SSH Keys",
      visible: () => true,
      execute: () => ctx.openKeyManager(),
      keywords: ["key", "identity", "certificate", "manage"],
    },
    {
      id: "keys.generate",
      title: "Open Settings (Generate Key)",
      category: "SSH Keys",
      visible: () => true,
      execute: () => ctx.generateKey(),
      keywords: ["create", "new", "keygen"],
    },

    // --- Dev/Debug ---
    {
      id: "dev.devtools",
      title: "Toggle Developer Tools (use shortcut)",
      category: "Dev/Debug",
      shortcut: "F12",
      visible: () => true,
      execute: () => ctx.toggleDevTools(),
      keywords: ["inspect", "console", "debug"],
    },
    {
      id: "dev.reload",
      title: "Reload Window",
      category: "Dev/Debug",
      shortcut: "Ctrl+Shift+R",
      visible: () => true,
      execute: () => ctx.reloadWindow(),
      keywords: ["refresh", "restart"],
    },
  ];
}
