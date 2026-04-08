import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { SftpEntry } from "@sshterm/shared";
import { formatDate, formatFileSize, getParentPath } from "../utils/fileUtils";

export interface SftpPropertiesDialogProps {
  open: boolean;
  path: string;
  entry: SftpEntry | null;
  isLoading: boolean;
  error: string | null;
  onApplyPermissions: (permissions: number) => Promise<void>;
  onClose: () => void;
}

function formatPermissionSymbolic(permissionBits: number): string {
  const userRead = (permissionBits & 0o400) !== 0 ? "r" : "-";
  const userWrite = (permissionBits & 0o200) !== 0 ? "w" : "-";
  const userExec = (permissionBits & 0o100) !== 0 ? "x" : "-";
  const groupRead = (permissionBits & 0o040) !== 0 ? "r" : "-";
  const groupWrite = (permissionBits & 0o020) !== 0 ? "w" : "-";
  const groupExec = (permissionBits & 0o010) !== 0 ? "x" : "-";
  const otherRead = (permissionBits & 0o004) !== 0 ? "r" : "-";
  const otherWrite = (permissionBits & 0o002) !== 0 ? "w" : "-";
  const otherExec = (permissionBits & 0o001) !== 0 ? "x" : "-";

  const setuid = (permissionBits & 0o4000) !== 0;
  const setgid = (permissionBits & 0o2000) !== 0;
  const sticky = (permissionBits & 0o1000) !== 0;

  const userExecFinal = setuid ? (userExec === "x" ? "s" : "S") : userExec;
  const groupExecFinal = setgid ? (groupExec === "x" ? "s" : "S") : groupExec;
  const otherExecFinal = sticky ? (otherExec === "x" ? "t" : "T") : otherExec;

  return `${userRead}${userWrite}${userExecFinal}${groupRead}${groupWrite}${groupExecFinal}${otherRead}${otherWrite}${otherExecFinal}`;
}

interface PropertyRowProps {
  label: string;
  value: string;
  monospace?: boolean;
}

function PropertyRow({ label, value, monospace }: PropertyRowProps) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-border/60 px-5 py-2.5 text-xs last:border-b-0">
      <div className="text-text-muted">{label}</div>
      <div className={`break-all text-text-primary ${monospace ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

interface PermissionToggleProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

function PermissionToggle({ label, active, onToggle }: PermissionToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-7 w-7 rounded-md border text-[11px] font-semibold transition-colors ${
        active
          ? "border-accent bg-accent/25 text-accent"
          : "border-border bg-base-900 text-text-secondary hover:border-accent/50 hover:text-text-primary"
      }`}
      aria-label={label}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function SftpPropertiesDialog({
  open,
  path,
  entry,
  isLoading,
  error,
  onApplyPermissions,
  onClose
}: SftpPropertiesDialogProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const [editablePermissions, setEditablePermissions] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const baselinePermissions = useMemo(() => (entry ? entry.permissions & 0o7777 : 0), [entry]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    setTimeout(() => closeBtnRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setEditablePermissions(baselinePermissions);
    setApplyError(null);
    setIsApplying(false);
  }, [baselinePermissions, open, path]);

  const permissionOctal = editablePermissions.toString(8).padStart(4, "0");
  const permissionSymbolic = formatPermissionSymbolic(editablePermissions);
  const isDirty = Boolean(entry) && editablePermissions !== baselinePermissions;
  const canApply = Boolean(entry) && !isLoading && !error && isDirty && !isApplying;

  const togglePermissionBit = (bit: number) => {
    if (!entry || isApplying) {
      return;
    }

    setEditablePermissions((prev) => prev ^ bit);
    setApplyError(null);
  };

  const handleApplyPermissions = async () => {
    if (!canApply) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);

    try {
      await onApplyPermissions(editablePermissions);
    } catch (applyPermissionsError) {
      const message =
        applyPermissionsError instanceof Error
          ? applyPermissionsError.message
          : "Failed to update permissions";
      setApplyError(message);
    } finally {
      setIsApplying(false);
    }
  };

  const typeLabel = entry ? (entry.isDirectory ? "Directory" : "File") : "—";
  const sizeLabel = entry
    ? `${formatFileSize(entry.size)} (${entry.size.toLocaleString()} bytes)`
    : "—";
  const modifiedLabel = entry ? formatDate(entry.modifiedAt) : "—";
  const nameLabel = entry?.name || path.split("/").filter(Boolean).at(-1) || path;
  const locationLabel = getParentPath(path);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onMouseDown={(event) => {
            mouseDownTargetRef.current = event.target;
          }}
          onClick={(event) => {
            if (
              event.target === backdropRef.current &&
              mouseDownTargetRef.current === backdropRef.current
            ) {
              onClose();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="mx-4 w-full max-w-xl overflow-hidden rounded-xl border border-border-bright/60 bg-base-800 shadow-2xl shadow-black/40"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold tracking-tight text-text-primary">Properties</h2>
              <p className="mt-1 text-xs text-text-secondary break-all">{path}</p>
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {isLoading && (
                <div className="px-5 py-6 text-sm text-text-secondary">Loading file details...</div>
              )}

              {!isLoading && error && (
                <div className="px-5 py-6 text-sm text-danger">{error}</div>
              )}

              {!isLoading && !error && (
                <>
                  <PropertyRow label="Name" value={nameLabel} />
                  <PropertyRow label="Path" value={path} monospace />
                  <PropertyRow label="Location" value={locationLabel} monospace />
                  <PropertyRow label="Type" value={typeLabel} />
                  <PropertyRow label="Size" value={sizeLabel} />
                  <PropertyRow label="Modified" value={modifiedLabel} />
                  <PropertyRow
                    label="Permissions"
                    value={`${permissionOctal} (${permissionSymbolic})`}
                    monospace
                  />
                  <PropertyRow label="Owner UID" value={entry ? String(entry.owner) : "—"} />
                  <PropertyRow label="Group GID" value={entry ? String(entry.group) : "—"} />

                  <div className="border-t border-border/60 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
                        Edit Permissions
                      </h3>
                      <span className="font-mono text-[11px] text-text-secondary">
                        {permissionOctal} ({permissionSymbolic})
                      </span>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-base-900/60 px-3 py-3">
                      <div className="mb-2 grid grid-cols-[68px_repeat(3,28px)] items-center gap-x-3 text-[11px] font-semibold text-text-muted">
                        <span />
                        <span className="text-center">R</span>
                        <span className="text-center">W</span>
                        <span className="text-center">X</span>
                      </div>

                      <div className="grid grid-cols-[68px_repeat(3,28px)] items-center gap-x-3 gap-y-2 text-xs">
                        <span className="text-text-secondary">Owner</span>
                        <PermissionToggle
                          label="R"
                          active={(editablePermissions & 0o400) !== 0}
                          onToggle={() => togglePermissionBit(0o400)}
                        />
                        <PermissionToggle
                          label="W"
                          active={(editablePermissions & 0o200) !== 0}
                          onToggle={() => togglePermissionBit(0o200)}
                        />
                        <PermissionToggle
                          label="X"
                          active={(editablePermissions & 0o100) !== 0}
                          onToggle={() => togglePermissionBit(0o100)}
                        />

                        <span className="text-text-secondary">Group</span>
                        <PermissionToggle
                          label="R"
                          active={(editablePermissions & 0o040) !== 0}
                          onToggle={() => togglePermissionBit(0o040)}
                        />
                        <PermissionToggle
                          label="W"
                          active={(editablePermissions & 0o020) !== 0}
                          onToggle={() => togglePermissionBit(0o020)}
                        />
                        <PermissionToggle
                          label="X"
                          active={(editablePermissions & 0o010) !== 0}
                          onToggle={() => togglePermissionBit(0o010)}
                        />

                        <span className="text-text-secondary">Others</span>
                        <PermissionToggle
                          label="R"
                          active={(editablePermissions & 0o004) !== 0}
                          onToggle={() => togglePermissionBit(0o004)}
                        />
                        <PermissionToggle
                          label="W"
                          active={(editablePermissions & 0o002) !== 0}
                          onToggle={() => togglePermissionBit(0o002)}
                        />
                        <PermissionToggle
                          label="X"
                          active={(editablePermissions & 0o001) !== 0}
                          onToggle={() => togglePermissionBit(0o001)}
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-border/70 bg-base-900/60 px-3 py-2.5">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                        Special Bits
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                            (editablePermissions & 0o4000) !== 0
                              ? "border-accent bg-accent/25 text-accent"
                              : "border-border bg-base-900 text-text-secondary hover:border-accent/50 hover:text-text-primary"
                          }`}
                          onClick={() => togglePermissionBit(0o4000)}
                        >
                          Set UID
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                            (editablePermissions & 0o2000) !== 0
                              ? "border-accent bg-accent/25 text-accent"
                              : "border-border bg-base-900 text-text-secondary hover:border-accent/50 hover:text-text-primary"
                          }`}
                          onClick={() => togglePermissionBit(0o2000)}
                        >
                          Set GID
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                            (editablePermissions & 0o1000) !== 0
                              ? "border-accent bg-accent/25 text-accent"
                              : "border-border bg-base-900 text-text-secondary hover:border-accent/50 hover:text-text-primary"
                          }`}
                          onClick={() => togglePermissionBit(0o1000)}
                        >
                          Sticky
                        </button>
                      </div>
                    </div>

                    {applyError && (
                      <p className="mt-3 text-xs text-danger">{applyError}</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <div className="text-xs text-text-muted">
                {isDirty ? "Unsaved permission changes" : "Permissions are up to date"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isDirty || isApplying}
                  onClick={() => {
                    setEditablePermissions(baselinePermissions);
                    setApplyError(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Revert
                </button>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={() => void handleApplyPermissions()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isApplying ? "Applying..." : "Apply"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-border/60 px-5 py-3">
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
