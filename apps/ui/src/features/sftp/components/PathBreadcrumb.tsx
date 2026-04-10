import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface BreadcrumbItem {
  label: string;
  path: string;
}

export interface PathBreadcrumbHandle {
  startEditing: () => void;
}

export interface PathBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
  separator?: string;
  editable?: boolean;
  onPathSubmit?: (path: string) => void;
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

export const PathBreadcrumb = forwardRef<PathBreadcrumbHandle, PathBreadcrumbProps>(
  function PathBreadcrumb({
    path,
    onNavigate,
    separator = "/",
    editable,
    onPathSubmit
  }, ref) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    startEditing: () => {
      if (editable) {
        setEditValue(path);
        setIsEditing(true);
      }
    },
  }));

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(path);
    }
  }, [path, isEditing]);

  if (editable && isEditing) {
    return (
      <div className="flex min-w-0 flex-1 items-center text-[11px]">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onPathSubmit?.(editValue);
              setIsEditing(false);
            }
            if (e.key === "Escape") {
              setIsEditing(false);
              setEditValue(path);
            }
            e.stopPropagation();
          }}
          onBlur={() => {
            setIsEditing(false);
            setEditValue(path);
          }}
          className="w-full rounded bg-base-800 px-1.5 py-0.5 text-text-primary outline-none ring-1 ring-accent/50"
          autoFocus
        />
      </div>
    );
  }

  const isWindowsPath = /^[a-zA-Z]:/.test(path);
  const crumbs = isWindowsPath
    ? buildWindowsCrumbs(path)
    : buildPosixCrumbs(path || "/");

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[11px] text-text-secondary"
      onDoubleClick={() => {
        if (editable) {
          setEditValue(path);
          setIsEditing(true);
        }
      }}
    >
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
});

