import { create } from "zustand";

const STORAGE_KEY = "hypershell:command-palette-recents";
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecents(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

type CommandPaletteState = {
  isOpen: boolean;
  recentIds: string[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  recordExecution: (id: string) => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  recentIds: loadRecents(),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  recordExecution: (id) =>
    set((s) => {
      const filtered = s.recentIds.filter((r) => r !== id);
      const next = [id, ...filtered].slice(0, MAX_RECENTS);
      saveRecents(next);
      return { recentIds: next };
    }),
}));
