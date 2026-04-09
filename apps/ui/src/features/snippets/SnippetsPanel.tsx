import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { toast } from "sonner";
import { useSnippetStore } from "./snippetStore";
import { layoutStore } from "../layout/layoutStore";

function SnippetForm({
  name,
  body,
  onNameChange,
  onBodyChange,
  onSave,
  onCancel,
}: {
  name: string;
  body: string;
  onNameChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-3 py-2 bg-base-800/60">
      <input
        className="w-full rounded border border-border bg-base-700 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 mb-2"
        placeholder="Name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        autoFocus
      />
      <textarea
        className="w-full rounded border border-border bg-base-700 px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 resize-none mb-2"
        placeholder="Snippet body..."
        rows={5}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-2.5 py-1 rounded text-xs text-text-muted border border-border hover:text-text-primary hover:bg-base-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-2.5 py-1 rounded text-xs font-medium text-accent border border-accent/30 bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function SnippetsPanel() {
  const { snippets, loading, isOpen, close, upsert, remove } = useSnippetStore();
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void useSnippetStore.getState().load();
    }
  }, [isOpen]);

  const startEdit = (id: string, name: string, body: string) => {
    setEditingId(id);
    setIsCreating(false);
    setFormName(name);
    setFormBody(body);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormName("");
    setFormBody("");
  };

  const cancelForm = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormName("");
    setFormBody("");
  };

  const saveForm = async () => {
    const name = formName.trim();
    const body = formBody.trim();
    if (!name || !body) return;

    const id = editingId ?? crypto.randomUUID();
    await upsert(id, name, body);
    cancelForm();
  };

  const sendToTerminal = (body: string) => {
    if (!activeSessionId) {
      toast.error("No active terminal session");
      return;
    }
    void window.hypershell?.writeSession?.({ sessionId: activeSessionId, data: body });
    // Move focus back to the terminal so Enter goes to the session, not the button
    (document.activeElement as HTMLElement | null)?.blur();
    const termEl = document.querySelector<HTMLElement>(".xterm-helper-textarea");
    termEl?.focus();
    toast.success("Snippet sent to terminal");
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    setConfirmDeleteId(null);
    toast.success("Snippet deleted");
  };

  return (
    <div
      aria-hidden={!isOpen}
      className={`absolute right-0 top-0 h-full w-80 z-30 flex flex-col bg-base-900 border-l border-border shadow-xl transition-[transform,opacity] duration-200 ease-out ${
        isOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "translate-x-full opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-base-800 shrink-0">
        <span className="text-sm font-semibold text-text-primary">Snippets</span>
        <div className="flex items-center gap-1">
          <button
            onClick={startCreate}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
            title="New Snippet"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={close}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
            title="Close"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="border-b border-border shrink-0">
          <div className="px-3 pt-2 text-xs font-medium text-text-muted">New Snippet</div>
          <SnippetForm
            name={formName}
            body={formBody}
            onNameChange={setFormName}
            onBodyChange={setFormBody}
            onSave={() => void saveForm()}
            onCancel={cancelForm}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && snippets.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-text-muted">
            Loading...
          </div>
        ) : snippets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-text-muted px-4 text-center">
            <span>No snippets yet.</span>
            <span>Click + to create your first snippet.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {snippets.map((snippet) => (
              <li key={snippet.id} className="group">
                {editingId === snippet.id ? (
                  <SnippetForm
                    name={formName}
                    body={formBody}
                    onNameChange={setFormName}
                    onBodyChange={setFormBody}
                    onSave={() => void saveForm()}
                    onCancel={cancelForm}
                  />
                ) : confirmDeleteId === snippet.id ? (
                  <div className="px-3 py-2 bg-base-800/60">
                    <p className="text-xs text-text-secondary mb-2">Delete "{snippet.name}"?</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded text-xs text-text-muted border border-border hover:text-text-primary hover:bg-base-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleDelete(snippet.id)}
                        className="px-2.5 py-1 rounded text-xs font-medium text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 px-3 py-2 hover:bg-base-800/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-text-primary truncate leading-tight">
                        {snippet.name}
                      </div>
                      <div className="text-xs text-text-muted font-mono mt-0.5 truncate leading-tight">
                        {snippet.body.slice(0, 50)}{snippet.body.length > 50 ? "\u2026" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => sendToTerminal(snippet.body)}
                        className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Send to terminal"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startEdit(snippet.id, snippet.name, snippet.body)}
                        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
                        title="Edit"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(snippet.id)}
                        className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
