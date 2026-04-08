import { useState, useEffect } from "react";
import { toast } from "sonner";

export function LoggingButton({ sessionId }: { sessionId: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    window.sshterm?.loggingGetState?.({ sessionId }).then((state) => {
      setActive(state.active);
    });
  }, [sessionId]);

  const toggle = async () => {
    try {
      if (active) {
        await window.sshterm?.loggingStop?.({ sessionId });
        setActive(false);
        toast.success("Session logging stopped");
      } else {
        const defaultName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
        const filePath = await window.sshterm?.fsShowSaveDialog?.({
          defaultPath: defaultName,
          filters: [{ name: "Log Files", extensions: ["log", "txt"] }],
        });
        if (!filePath) return;
        await window.sshterm?.loggingStart?.({ sessionId, filePath });
        setActive(true);
        toast.success("Session logging started");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logging failed");
    }
  };

  return (
    <button
      onClick={toggle}
      className={`p-1 rounded transition-colors ${active ? "text-red-400 hover:text-red-300" : "text-text-muted hover:text-text-primary"}`}
      title={active ? "Stop logging" : "Start session logging"}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="6" cy="6" r={active ? 5 : 4} />
      </svg>
    </button>
  );
}
