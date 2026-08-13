import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";

import { createEditorStore } from "./stores/editorStore";
import type { EditorState, EditorTab } from "./stores/editorStore";
import { EditorTabBar } from "./components/EditorTabBar";
import { EditorToolbar } from "./components/EditorToolbar";
const EditorPane = lazy(() => import("./components/EditorPane").then((m) => ({ default: m.EditorPane })));
import { EditorStatusBar } from "./components/EditorStatusBar";
import { getLanguageName } from "../sftp/utils/languageDetect";

interface EditorAppProps {
  sftpSessionId: string;
}

interface EditorContentProps {
  activeTab: EditorTab | undefined;
  store: StoreApi<EditorState>;
  saving: boolean;
  sessionDisconnected: boolean;
  onSave: () => void;
  onDownloadBinary: (remotePath: string, fileName: string) => void;
}

// Active-tab pane: no file open, loading, binary (read-only notice), or the editor itself.
function EditorContent({
  activeTab,
  store,
  saving,
  sessionDisconnected,
  onSave,
  onDownloadBinary,
}: EditorContentProps) {
  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        No files open
      </div>
    );
  }

  if (activeTab.loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        Loading {activeTab.fileName}...
      </div>
    );
  }

  if (activeTab.readOnly) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-primary">
          {activeTab.fileName} is a binary file
        </p>
        <p className="max-w-md text-xs text-text-secondary">
          Editing it here would corrupt its contents, so it is open read-only.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100"
            onClick={() => onDownloadBinary(activeTab.remotePath, activeTab.fileName)}
          >
            Download
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center text-text-secondary">
        Loading editor...
      </div>
    }>
      <EditorPane
        key={activeTab.id}
        store={store}
        tabId={activeTab.id}
        content={activeTab.content}
        onSave={onSave}
        canSave={Boolean(activeTab.dirty) && !saving && !sessionDisconnected}
      />
    </Suspense>
  );
}

export function EditorApp({ sftpSessionId }: EditorAppProps) {
  const store = useMemo(() => createEditorStore(sftpSessionId), [sftpSessionId]);
  const storeRef = useRef(store);
  storeRef.current = store;

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const sessionDisconnected = useStore(store, (s) => s.sessionDisconnected);
  const [saving, setSaving] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const openFile = useCallback(
    async (remotePath: string) => {
      const s = storeRef.current.getState();
      // Already open — focus it instead of re-reading the file
      const existing = s.tabs.find((t) => t.remotePath === remotePath);
      if (existing) {
        s.setActiveTab(existing.id);
        return;
      }

      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fileName = remotePath.split("/").pop() ?? remotePath;
      const language = getLanguageName(fileName);

      s.addTab({
        id: tabId,
        remotePath,
        fileName,
        content: "",
        originalContent: "",
        dirty: false,
        loading: true,
        error: null,
        language,
        encoding: "utf-8",
        readOnly: false,
      });

      try {
        const response = await window.hypershell?.sftpReadFile?.({
          sftpSessionId,
          path: remotePath,
        });

        if (!response) {
          storeRef.current.getState().updateTab(tabId, {
            loading: false,
            error: "Failed to read file",
          });
          return;
        }

        if (response.encoding === "base64") {
          storeRef.current.getState().updateTab(tabId, {
            loading: false,
            content: "",
            originalContent: "",
            encoding: "base64",
            readOnly: true,
          });
          return;
        }

        storeRef.current.getState().updateTab(tabId, {
          loading: false,
          content: response.content,
          originalContent: response.content,
          encoding: "utf-8",
          readOnly: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load file";
        storeRef.current.getState().updateTab(tabId, { loading: false, error: message });
      }
    },
    [sftpSessionId]
  );

  useEffect(() => {
    return window.hypershell?.onEditorOpenFile?.((event) => {
      void openFile(event.remotePath);
    });
  }, [openFile]);

  useEffect(() => {
    return window.hypershell?.onEditorSessionClosed?.(() => {
      storeRef.current.getState().setSessionDisconnected();
    });
  }, []);

  // Stable save handler — reads live state to avoid re-registration on every keystroke
  const handleSave = useCallback(async () => {
    const { tabs: currentTabs, activeTabId: currentId, sessionDisconnected: disconnected } = storeRef.current.getState();
    const tab = currentTabs.find((t) => t.id === currentId);
    if (!tab || disconnected || tab.readOnly) return;

    setSaving(true);
    try {
      await window.hypershell?.sftpWriteFile?.({
        sftpSessionId,
        path: tab.remotePath,
        content: tab.content,
        encoding: "utf-8",
      });
      storeRef.current.getState().updateTab(tab.id, {
        originalContent: tab.content,
        dirty: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save file";
      storeRef.current.getState().updateTab(tab.id, { error: message });
    } finally {
      setSaving(false);
    }
  }, [sftpSessionId]);

  const handleDownloadBinary = useCallback(
    async (remotePath: string, fileName: string) => {
      const targetPath = await window.hypershell?.fsShowSaveDialog?.({ defaultPath: fileName });
      if (!targetPath) return;

      await window.hypershell?.sftpTransferStart?.({
        sftpSessionId,
        operations: [
          { type: "download", localPath: targetPath, remotePath, isDirectory: false },
        ],
      });
    },
    [sftpSessionId]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = storeRef.current.getState().tabs.find((t) => t.id === tabId);
      if (tab?.dirty && !window.confirm(`"${tab.fileName}" has unsaved changes. Close anyway?`)) {
        return;
      }
      storeRef.current.getState().removeTab(tabId);
      if (storeRef.current.getState().tabs.length === 0) {
        window.close();
      }
    },
    []
  );

  // Stable keydown — no deps on activeTab/handleSave
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const id = storeRef.current.getState().activeTabId;
        if (id) handleCloseTab(id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleCloseTab]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = storeRef.current.getState().tabs.some((t) => t.dirty);
      if (hasDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-base-900 text-text-primary">
      {sessionDisconnected && (
        <div className="bg-red-900/60 px-3 py-1.5 text-center text-xs text-red-200">
          SFTP session disconnected. Save is disabled.
        </div>
      )}

      <EditorTabBar store={store} onCloseTab={handleCloseTab} />

      <EditorToolbar
        store={store}
        onSave={() => void handleSave()}
        saving={saving}
        disabled={sessionDisconnected || Boolean(activeTab?.readOnly)}
      />

      <div className="relative flex-1 overflow-hidden">
        <EditorContent
          activeTab={activeTab}
          store={store}
          saving={saving}
          sessionDisconnected={sessionDisconnected}
          onSave={() => void handleSave()}
          onDownloadBinary={(remotePath, fileName) => void handleDownloadBinary(remotePath, fileName)}
        />
      </div>

      <EditorStatusBar store={store} />
    </div>
  );
}
