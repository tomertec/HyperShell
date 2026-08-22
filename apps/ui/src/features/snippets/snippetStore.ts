import { create } from "zustand";
import { getShell } from "../../lib/shell";

type SnippetRecord = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type SnippetStore = {
  snippets: SnippetRecord[];
  isOpen: boolean;
  loading: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  upsert: (id: string, name: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  isOpen: false,
  loading: false,
  toggle: () => {
    const wasOpen = get().isOpen;
    set({ isOpen: !wasOpen });
    if (!wasOpen) void get().load();
  },
  open: () => {
    set({ isOpen: true });
    void get().load();
  },
  close: () => set({ isOpen: false }),
  load: async () => {
    set({ loading: true });
    const snippets = await getShell().snippetsList() ?? [];
    set({ snippets, loading: false });
  },
  upsert: async (id, name, body) => {
    await getShell().snippetsUpsert({ id, name, body });
    void get().load();
  },
  remove: async (id) => {
    await getShell().snippetsRemove({ id });
    void get().load();
  },
}));
