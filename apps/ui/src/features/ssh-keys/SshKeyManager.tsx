import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface SshKeyInfo {
  path: string;
  name: string;
  type: string;
  bits: number | null;
  fingerprint: string | null;
  hasPublicKey: boolean;
  createdAt: string | null;
}

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

const TYPE_STYLES: Record<string, { color: string; bg: string }> = {
  ed25519: { color: "text-green-400", bg: "bg-green-400/10" },
  rsa: { color: "text-blue-400", bg: "bg-blue-400/10" },
  ecdsa: { color: "text-yellow-400", bg: "bg-yellow-400/10" },
  dsa: { color: "text-red-400", bg: "bg-red-400/10" },
  unknown: { color: "text-text-muted", bg: "bg-base-700" },
};

function formatFingerprint(fp: string): string {
  // Extract just the hash part (SHA256:...) from "256 SHA256:... comment (TYPE)"
  const match = fp.match(/(SHA256:\S+)/);
  return match ? match[1] : fp;
}

export function SshKeyManager() {
  const [keys, setKeys] = useState<SshKeyInfo[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genType, setGenType] = useState<"ed25519" | "rsa" | "ecdsa">("ed25519");
  const [genName, setGenName] = useState("");
  const [genPassphrase, setGenPassphrase] = useState("");
  const [genComment, setGenComment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [converting, setConverting] = useState(false);

  const refresh = async () => {
    const result = await window.sshterm?.sshKeysList?.();
    if (result) setKeys(result);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleGenerate = async () => {
    if (!genName.trim()) return;
    setGenerating(true);
    try {
      await window.sshterm?.sshKeysGenerate?.({
        type: genType,
        name: genName.trim(),
        passphrase: genPassphrase || undefined,
        comment: genComment || undefined,
        bits: genType === "rsa" ? 4096 : undefined,
      });
      setGenName("");
      setGenPassphrase("");
      setGenComment("");
      setShowGenerate(false);
      await refresh();
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = async (path: string, name: string) => {
    if (!confirm(`Delete key "${name}" and its public key?`)) return;
    await window.sshterm?.sshKeysRemove?.({ path });
    await refresh();
  };

  const handleImportPpk = useCallback(async () => {
    // Use a hidden file input to pick a .ppk file
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ppk";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Electron file inputs expose .path
      const ppkPath = (file as File & { path?: string }).path;
      if (!ppkPath) {
        toast.error("Could not determine file path.");
        return;
      }
      setConverting(true);
      try {
        const result = await window.sshterm?.sshKeysConvertPpk?.({ ppkPath });
        if (!result) {
          toast.error("PPK conversion not available.");
          return;
        }
        if (result.success) {
          toast.success(`Converted to OpenSSH format: ${result.outputPath}`);
          await refresh();
        } else {
          toast.error(result.error ?? "Conversion failed.");
        }
      } catch (err) {
        toast.error(`Conversion failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setConverting(false);
      }
    };
    input.click();
  }, []);

  return (
    <div className="grid gap-6">
      {/* Header with generate button */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-text-muted">
            Manage SSH keys stored in ~/.ssh
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleImportPpk()}
            disabled={converting}
            className="text-xs px-2.5 py-1.5 rounded-lg transition-colors bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {converting ? "Converting..." : "Import PPK"}
          </button>
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className={[
              "text-xs px-2.5 py-1.5 rounded-lg transition-colors",
              showGenerate
                ? "text-text-muted hover:text-text-primary"
                : "bg-accent/10 text-accent hover:bg-accent/20",
            ].join(" ")}
          >
            {showGenerate ? "Cancel" : "+ Generate Key"}
          </button>
        </div>
      </div>

      {/* Generate form */}
      {showGenerate && (
        <div className="grid gap-3 p-4 rounded-lg border border-border bg-base-800/50">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Generate New Key</h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-text-secondary">Algorithm</span>
              <select
                value={genType}
                onChange={(e) => setGenType(e.target.value as "ed25519" | "rsa" | "ecdsa")}
                className={inputClasses}
              >
                <option value="ed25519">ED25519 (recommended)</option>
                <option value="rsa">RSA (4096-bit)</option>
                <option value="ecdsa">ECDSA</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-text-secondary">Filename</span>
              <input
                type="text"
                value={genName}
                onChange={(e) => setGenName(e.target.value)}
                placeholder="id_ed25519_work"
                className={inputClasses}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-text-secondary">Passphrase</span>
              <input
                type="password"
                value={genPassphrase}
                onChange={(e) => setGenPassphrase(e.target.value)}
                placeholder="Optional"
                className={inputClasses}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-text-secondary">Comment</span>
              <input
                type="text"
                value={genComment}
                onChange={(e) => setGenComment(e.target.value)}
                placeholder="user@machine"
                className={inputClasses}
              />
            </label>
          </div>
          <button
            onClick={() => void handleGenerate()}
            disabled={!genName.trim() || generating}
            className="justify-self-start rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? "Generating..." : "Generate Key"}
          </button>
        </div>
      )}

      {/* Key list */}
      {keys.length === 0 ? (
        <div className="text-sm text-text-muted text-center py-10 border border-dashed border-border rounded-lg">
          No SSH keys found in ~/.ssh
        </div>
      ) : (
        <div className="grid gap-1">
          {keys.map((key) => {
            const style = TYPE_STYLES[key.type] ?? TYPE_STYLES.unknown;
            return (
              <div
                key={key.path}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-base-700/30 group transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {key.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${style.color} ${style.bg}`}
                    >
                      {key.type}
                    </span>
                    {key.bits && (
                      <span className="text-[10px] text-text-muted">
                        {key.bits}-bit
                      </span>
                    )}
                    {key.hasPublicKey && (
                      <span className="text-[10px] text-text-muted px-1 py-0.5 rounded bg-base-700">
                        .pub
                      </span>
                    )}
                  </div>
                  {key.fingerprint && (
                    <div className="text-[11px] text-text-muted font-mono truncate">
                      {formatFingerprint(key.fingerprint)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void handleRemove(key.path, key.name)}
                  className="hidden group-hover:flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors shrink-0 mt-0.5"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 3h8M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 5.5v3M7 5.5v3M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
