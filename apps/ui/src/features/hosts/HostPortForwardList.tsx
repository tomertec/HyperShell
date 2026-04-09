import { useCallback, useEffect, useState } from "react";
import type { HostPortForwardRecord } from "@hypershell/shared";
import { inputClasses, protocolBadgeClasses } from "../../lib/formStyles";

interface HostPortForwardListProps {
  hostId: string;
}

export function HostPortForwardList({ hostId }: HostPortForwardListProps) {
  const [forwards, setForwards] = useState<HostPortForwardRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    protocol: "local" as "local" | "remote" | "dynamic",
    localPort: "",
    remoteHost: "",
    remotePort: "",
    autoStart: false,
  });

  const refresh = useCallback(async () => {
    try {
      const result = await window.hypershell?.hostPortForwardList?.({ hostId });
      if (result) setForwards(result);
    } catch { /* ignore */ }
  }, [hostId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetForm = () => {
    setForm({ name: "", protocol: "local", localPort: "", remoteHost: "", remotePort: "", autoStart: false });
    setShowForm(false);
    setEditId(null);
  };

  const handleSave = async () => {
    const id = editId ?? crypto.randomUUID();
    await window.hypershell?.hostPortForwardUpsert?.({
      id,
      hostId,
      name: form.name || `Forward :${form.localPort}`,
      protocol: form.protocol,
      localPort: Number(form.localPort) || 0,
      remoteHost: form.remoteHost,
      remotePort: Number(form.remotePort) || 0,
      autoStart: form.autoStart,
    });
    resetForm();
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await window.hypershell?.hostPortForwardRemove?.({ id });
    await refresh();
  };

  const handleEdit = (fwd: HostPortForwardRecord) => {
    setForm({
      name: fwd.name,
      protocol: fwd.protocol,
      localPort: String(fwd.localPort),
      remoteHost: fwd.remoteHost,
      remotePort: String(fwd.remotePort),
      autoStart: fwd.autoStart,
    });
    setEditId(fwd.id);
    setShowForm(true);
  };

  return (
    <div className="grid gap-3 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Port Forwards</span>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="text-xs text-accent hover:text-accent/80 transition-colors"
        >
          + Add Forward
        </button>
      </div>

      {forwards.length > 0 && (
        <div className="grid gap-1">
          {forwards.map((fwd) => (
            <div key={fwd.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface/40 border border-border/30 text-sm">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${protocolBadgeClasses[fwd.protocol] ?? ""}`}>
                {fwd.protocol === "local" ? "L" : fwd.protocol === "remote" ? "R" : "D"}
              </span>
              <span className="text-text-primary font-medium truncate">{fwd.name}</span>
              <span className="text-text-muted text-xs ml-auto">
                :{fwd.localPort}
                {fwd.protocol !== "dynamic" && ` → ${fwd.remoteHost}:${fwd.remotePort}`}
              </span>
              {fwd.autoStart && (
                <span className="text-[10px] text-green-400 border border-green-500/30 bg-green-500/10 px-1 rounded">auto</span>
              )}
              <button type="button" onClick={() => handleEdit(fwd)} className="text-text-muted hover:text-text-primary text-xs ml-1">edit</button>
              <button type="button" onClick={() => handleDelete(fwd.id)} className="text-text-muted hover:text-red-400 text-xs">del</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="grid gap-2 p-3 rounded-lg bg-surface/60 border border-border/40">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className={inputClasses}
            />
            <select
              value={form.protocol}
              onChange={(e) => setForm({ ...form, protocol: e.target.value as "local" | "remote" | "dynamic" })}
              className={inputClasses}
            >
              <option value="local">Local (-L)</option>
              <option value="remote">Remote (-R)</option>
              <option value="dynamic">Dynamic (-D)</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={form.localPort}
              onChange={(e) => setForm({ ...form, localPort: e.target.value })}
              placeholder="Local port"
              className={inputClasses}
            />
            {form.protocol !== "dynamic" && (
              <>
                <input
                  value={form.remoteHost}
                  onChange={(e) => setForm({ ...form, remoteHost: e.target.value })}
                  placeholder="Remote host"
                  className={inputClasses}
                />
                <input
                  type="number"
                  value={form.remotePort}
                  onChange={(e) => setForm({ ...form, remotePort: e.target.value })}
                  placeholder="Remote port"
                  className={inputClasses}
                />
              </>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoStart}
              onChange={(e) => setForm({ ...form, autoStart: e.target.checked })}
              className="rounded border-border accent-accent"
            />
            <span className="text-xs text-text-primary">Auto-start on connect</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25"
            >
              {editId ? "Update" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {forwards.length === 0 && !showForm && (
        <span className="text-xs text-text-muted/60 italic">No port forwards configured.</span>
      )}
    </div>
  );
}
