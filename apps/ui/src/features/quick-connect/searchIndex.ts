import Fuse from "fuse.js";

export type QuickConnectProfile = {
  id: string;
  label: string;
  hostname?: string;
  transport: "ssh" | "serial";
  group?: string;
  tags?: string[];
  description?: string;
};

export function searchProfiles(
  profiles: QuickConnectProfile[],
  query: string
): QuickConnectProfile[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return profiles;
  }

  const fuse = new Fuse(profiles, {
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    keys: ["label", "hostname", "group", "tags", "description"]
  });

  return fuse.search(trimmed).map((result) => result.item);
}
