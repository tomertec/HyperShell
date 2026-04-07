import Fuse, { type IFuseOptions } from "fuse.js";

export type QuickConnectProfile = {
  id: string;
  label: string;
  hostname?: string;
  transport: "ssh" | "serial";
  group?: string;
  tags?: string[];
  description?: string;
};

const fuseOptions: IFuseOptions<QuickConnectProfile> = {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  keys: ["label", "hostname", "group", "tags", "description"]
};

let cachedProfiles: QuickConnectProfile[] | null = null;
let cachedFuse: Fuse<QuickConnectProfile> | null = null;

export function searchProfiles(
  profiles: QuickConnectProfile[],
  query: string
): QuickConnectProfile[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return profiles;
  }

  if (cachedProfiles !== profiles) {
    cachedFuse = new Fuse(profiles, fuseOptions);
    cachedProfiles = profiles;
  }

  return cachedFuse!.search(trimmed).map((result) => result.item);
}
