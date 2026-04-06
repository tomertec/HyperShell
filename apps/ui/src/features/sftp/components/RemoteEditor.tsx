import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, basicSetup } from "codemirror";

import { getLanguageExtension } from "../utils/languageDetect";

export interface RemoteEditorProps {
  sftpSessionId: string;
  remotePath: string;
  onClose: () => void;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function RemoteEditor({
  sftpSessionId,
  remotePath,
  onClose
}: RemoteEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const originalContentRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileName = remotePath.split("/").pop() ?? remotePath;

  useEffect(() => {
    let disposed = false;

    async function loadFile() {
      setLoading(true);
      setError(null);

      try {
        const response = await window.sshterm?.sftpReadFile?.({
          sftpSessionId,
          path: remotePath
        });

        if (!response || disposed) {
          return;
        }

        const content =
          response.encoding === "base64"
            ? decodeBase64Utf8(response.content)
            : response.content;

        originalContentRef.current = content;

        const languageExtension = getLanguageExtension(fileName);
        let dirtyCheckTimer: ReturnType<typeof setTimeout> | null = null;
        const extensions = [
          basicSetup,
          oneDark,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }

            // Mark dirty immediately on any change, debounce the expensive
            // full-content comparison for when the user stops typing.
            setDirty(true);
            if (dirtyCheckTimer) clearTimeout(dirtyCheckTimer);
            dirtyCheckTimer = setTimeout(() => {
              setDirty(update.state.doc.toString() !== originalContentRef.current);
            }, 500);
          })
        ];

        if (languageExtension) {
          extensions.push(languageExtension);
        }

        if (editorContainerRef.current) {
          editorViewRef.current?.destroy();
          editorViewRef.current = new EditorView({
            state: EditorState.create({
              doc: content,
              extensions
            }),
            parent: editorContainerRef.current
          });
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load remote file";
        setError(message);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadFile();

    return () => {
      disposed = true;
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  }, [fileName, remotePath, sftpSessionId]);

  const handleSave = useCallback(async () => {
    if (!editorViewRef.current) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const content = editorViewRef.current.state.doc.toString();
      await window.sshterm?.sftpWriteFile?.({
        sftpSessionId,
        path: remotePath,
        content,
        encoding: "utf-8"
      });

      originalContentRef.current = content;
      setDirty(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save remote file";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [remotePath, sftpSessionId]);

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Close anyway?")) {
      return;
    }

    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, handleSave]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-base-900">
      <div className="flex items-center justify-between border-b border-base-700 bg-base-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-mono text-sm text-text-primary">{fileName}</span>
          <span className="max-w-[320px] truncate text-xs text-text-secondary" title={remotePath}>
            {remotePath}
          </span>
          {dirty && <span className="text-xs text-yellow-400">Modified</span>}
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}

          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving || !dirty}
            className="rounded bg-accent px-3 py-1 text-sm text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="rounded border border-base-600 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
          >
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-text-secondary">
          Loading file...
        </div>
      ) : (
        <div ref={editorContainerRef} className="flex-1 overflow-auto" />
      )}
    </div>
  );
}
