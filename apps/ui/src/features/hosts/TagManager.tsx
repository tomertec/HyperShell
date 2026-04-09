import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TagRecord } from "@hypershell/shared";
import { Modal } from "../layout/Modal";
import { inputClasses } from "../../lib/formStyles";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const TAG_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

type TagDraft = {
  name: string;
  color: string;
};

const emptyDraft: TagDraft = {
  name: "",
  color: "#3b82f6",
};

function toDraft(tag: TagRecord | null): TagDraft {
  if (!tag) {
    return { ...emptyDraft };
  }
  return {
    name: tag.name,
    color: tag.color ?? "#3b82f6",
  };
}

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
  onTagsChanged?: (tags: TagRecord[]) => void;
}

export function TagManager({ open, onClose, onTagsChanged }: TagManagerProps) {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TagDraft>({ ...emptyDraft });
  const [isSaving, setIsSaving] = useState(false);

  const loadTags = useCallback(async () => {
    if (!window.hypershell?.listTags) {
      setTags([]);
      onTagsChanged?.([]);
      return;
    }

    try {
      const loaded = await window.hypershell.listTags();
      setTags(loaded);
      onTagsChanged?.(loaded);
      setSelectedId((current) => {
        if (current && loaded.some((tag) => tag.id === current)) {
          return current;
        }
        return loaded[0]?.id ?? null;
      });
    } catch (error) {
      toast.error(
        `Failed to load tags: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [onTagsChanged]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadTags();
  }, [loadTags, open]);

  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === selectedId) ?? null,
    [selectedId, tags]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(toDraft(selectedTag));
  }, [open, selectedTag]);

  const startNewTag = useCallback(() => {
    setSelectedId(null);
    setDraft({ ...emptyDraft });
  }, []);

  const saveTag = useCallback(async () => {
    if (!window.hypershell?.upsertTag) {
      toast.error("Tag API is unavailable.");
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      toast.error("Tag name is required.");
      return;
    }

    const normalizedColor = draft.color.trim();
    if (!HEX_COLOR_REGEX.test(normalizedColor)) {
      toast.error("Tag color must be a valid hex value like #22c55e.");
      return;
    }

    setIsSaving(true);
    try {
      const id = selectedTag?.id ?? `tag-${Date.now()}`;
      const saved = await window.hypershell.upsertTag({
        id,
        name: trimmedName,
        color: normalizedColor,
      });
      await loadTags();
      setSelectedId(saved.id);
      toast.success(selectedTag ? "Tag updated." : "Tag created.");
    } catch (error) {
      toast.error(
        `Failed to save tag: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsSaving(false);
    }
  }, [draft.color, draft.name, loadTags, selectedTag]);

  const removeTag = useCallback(async () => {
    if (!selectedTag || !window.hypershell?.removeTag) {
      return;
    }
    if (!window.confirm(`Delete tag "${selectedTag.name}"?`)) {
      return;
    }
    try {
      await window.hypershell.removeTag({ id: selectedTag.id });
      await loadTags();
      setSelectedId(null);
      setDraft({ ...emptyDraft });
      toast.success("Tag deleted.");
    } catch (error) {
      toast.error(
        `Failed to delete tag: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [loadTags, selectedTag]);

  return (
    <Modal open={open} onClose={onClose} title="Tag Manager">
      <div className="grid gap-4 md:grid-cols-[220px,1fr]">
        <div className="grid gap-2 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <button
            type="button"
            onClick={startNewTag}
            className="rounded-md border border-border bg-base-800 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-base-700"
          >
            New Tag
          </button>
          <div className="max-h-72 overflow-y-auto">
            {tags.length === 0 ? (
              <div className="rounded-md border border-border bg-base-900 px-3 py-2 text-xs text-text-muted">
                No tags yet.
              </div>
            ) : (
              <div className="grid gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedId(tag.id)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedId === tag.id
                        ? "border-accent/40 bg-accent/10 text-text-primary"
                        : "border-border bg-base-900 text-text-secondary hover:bg-base-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#64748b" }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Name</span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className={inputClasses}
            />
          </label>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-text-secondary">Color</span>
            <div className="flex flex-wrap items-center gap-2">
              {TAG_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft({ ...draft, color })}
                  className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                    draft.color.toLowerCase() === color.toLowerCase()
                      ? "border-white/80 ring-2 ring-white/30"
                      : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={HEX_COLOR_REGEX.test(draft.color) ? draft.color : "#3b82f6"}
                onChange={(event) =>
                  setDraft({ ...draft, color: event.target.value })
                }
                className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                title="Custom color"
              />
            </div>
            <input
              value={draft.color}
              onChange={(event) =>
                setDraft({ ...draft, color: event.target.value })
              }
              placeholder="#3b82f6"
              className={inputClasses}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void saveTag()}
              disabled={isSaving}
              className="rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : selectedTag ? "Update Tag" : "Create Tag"}
            </button>
            <button
              type="button"
              onClick={() => void removeTag()}
              disabled={!selectedTag}
              className="rounded-md border border-border bg-base-800 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-base-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
