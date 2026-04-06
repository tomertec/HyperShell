interface BreadcrumbItem {
  label: string;
  path: string;
}

export interface PathBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  separator?: string;
}

function buildPosixCrumbs(path: string): BreadcrumbItem[] {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  const crumbs: BreadcrumbItem[] = [{ label: "/", path: "/" }];
  let current = "";

  for (const part of parts) {
    current = `${current}/${part}`;
    crumbs.push({ label: part, path: current });
  }

  return crumbs;
}

function buildWindowsCrumbs(path: string): BreadcrumbItem[] {
  const normalized = path.replace(/\//g, "\\");
  const match = normalized.match(/^([a-zA-Z]:)(?:\\(.*))?$/);
  if (!match) {
    return [{ label: normalized, path: normalized }];
  }

  const drive = match[1];
  const tail = match[2] ?? "";
  const parts = tail.split("\\").filter(Boolean);

  const crumbs: BreadcrumbItem[] = [{ label: drive, path: `${drive}\\` }];
  let current = `${drive}\\`;

  for (const part of parts) {
    current = `${current}${part}\\`;
    crumbs.push({ label: part, path: current.replace(/\\$/, "") });
  }

  return crumbs;
}

export function PathBreadcrumb({
  path,
  onNavigate,
  separator = "/"
}: PathBreadcrumbProps) {
  const isWindowsPath = /^[a-zA-Z]:/.test(path);
  const crumbs = isWindowsPath
    ? buildWindowsCrumbs(path)
    : buildPosixCrumbs(path || "/");

  return (
    <div className="flex items-center gap-0.5 overflow-hidden px-2 py-1 text-sm text-text-secondary">
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex shrink-0 items-center">
          {index > 0 && <span className="mx-1 text-text-secondary/50">{separator}</span>}
          <button
            type="button"
            title={crumb.path}
            className="max-w-[140px] truncate hover:text-text-primary hover:underline"
            onClick={() => onNavigate(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}
