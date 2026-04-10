import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { createEditorStore } from "./stores/editorStore";
import { EditorTabBar } from "./components/EditorTabBar";
import { EditorToolbar } from "./components/EditorToolbar";
const EditorPane = lazy(() => import("./components/EditorPane").then((m) => ({ default: m.EditorPane })));
import { EditorStatusBar } from "./components/EditorStatusBar";
import { getLanguageName } from "../sftp/utils/languageDetect";
import { decodeBase64Utf8 } from "../sftp/utils/fileUtils";

interface EditorAppProps {
  sftpSessionId: string;
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
      // Dedup check before creating tab
      if (s.tabs.some((t) => t.remotePath === remotePath)) {
        s.addTab({ id: "", remotePath, fileName: "", content: "", originalContent: "", dirty: false, loading: false, error: null, language: "" });
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

        const content =
          response.encoding === "base64"
            ? decodeBase64Utf8(response.content)
            : response.content;

        storeRef.current.getState().updateTab(tabId, {
          loading: false,
          content,
          originalContent: content,
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
    if (!tab || disconnected) return;

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
        disabled={sessionDisconnected}
      />

      <div className="relative flex-1 overflow-hidden">
        {activeTab ? (
          activeTab.loading ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              Loading {activeTab.fileName}...
            </div>
          ) : (
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
              />
            </Suspense>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            No files open
          </div>
        )}
      </div>

      <EditorStatusBar store={store} />
    </div>
  );
}
