import Fuse, { type IFuseOptions } from "fuse.js";

export type Command = {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  icon?: unknown;
  visible: () => boolean;
  execute: () => void | Promise<void>;
  keywords?: string[];
};

const fuseOptions: IFuseOptions<Command> = {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  keys: ["title", "keywords", "category"],
};

export function searchCommands(commands: Command[], query: string): Command[] {
  const visible = commands.filter((c) => c.visible());
  const trimmed = query.trim();
  if (!trimmed) return visible;

  const fuse = new Fuse(visible, fuseOptions);
  return fuse.search(trimmed).map((r) => r.item);
}
