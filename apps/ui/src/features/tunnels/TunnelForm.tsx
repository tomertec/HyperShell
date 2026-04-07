import { useState } from "react";

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

interface TunnelFormProps {
  onSubmit: () => void;
  onCancel: () => void;
}

export function TunnelForm({ onSubmit, onCancel }: TunnelFormProps) {
  const [form, setForm] = useState({
    hostname: "",
    username: "",
    port: "22",
    protocol: "local" as "local" | "remote" | "dynamic",
    localPort: "",
    remoteHost: "",
    remotePort: "",
  });

  const handleStart = async () => {
    await window.sshterm?.startPortForward?.({
      hostname: form.hostname,
      username: form.username || undefined,
      port: Number(form.port) || undefined,
      protocol: form.protocol,
      localAddress: "127.0.0.1",
      localPort: Number(form.localPort),
      remoteHost: form.remoteHost,
      remotePort: Number(form.remotePort) || 0,
    });
    onSubmit();
  };

  return (
    <div className="grid gap-2 p-3 rounded-lg bg-surface/60 border border-border/40">
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">New Port Forward</div>
      <div className="grid grid-cols-3 gap-2">
        <input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="Host" className={inputClasses} />
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username" className={inputClasses} />
        <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="SSH Port" className={inputClasses} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as any })} className={inputClasses}>
          <option value="local">Local (-L)</option>
          <option value="remote">Remote (-R)</option>
          <option value="dynamic">Dynamic (-D)</option>
        </select>
        <input type="number" value={form.localPort} onChange={(e) => setForm({ ...form, localPort: e.target.value })} placeholder="Local port" className={inputClasses} />
        {form.protocol !== "dynamic" && (
          <>
            <input value={form.remoteHost} onChange={(e) => setForm({ ...form, remoteHost: e.target.value })} placeholder="Remote host" className={inputClasses} />
            <input type="number" value={form.remotePort} onChange={(e) => setForm({ ...form, remotePort: e.target.value })} placeholder="Remote port" className={inputClasses} />
          </>
        )}
      </div>
      <div className="flex gap-2 mt-1">
        <button onClick={handleStart} className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors">Start</button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary transition-colors">Cancel</button>
      </div>
    </div>
  );
}
