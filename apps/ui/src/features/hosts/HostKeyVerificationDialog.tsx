import { useState } from "react";
import { Modal } from "../layout/Modal";
import { Button } from "../../components/ui/Button";

export interface HostKeyVerificationInfo {
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  verificationStatus: "new_host" | "key_changed";
  previousFingerprint?: string;
}

interface HostKeyVerificationDialogProps {
  open: boolean;
  info: HostKeyVerificationInfo | null;
  onTrust: () => void | Promise<void>;
  onReject: () => void;
}

export function HostKeyVerificationDialog({
  open,
  info,
  onTrust,
  onReject,
}: HostKeyVerificationDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const isKeyChanged = info?.verificationStatus === "key_changed";

  const handleTrust = async () => {
    setConfirming(true);
    try {
      await onTrust();
    } finally {
      setConfirming(false);
    }
  };

  if (!info) return null;

  return (
    <Modal
      open={open}
      onClose={onReject}
      title={isKeyChanged ? "WARNING: Host Key Changed" : "Unknown Host Key"}
      footer={
        <>
          <Button variant="ghost" onClick={onReject}>
            Reject
          </Button>
          <Button
            variant={isKeyChanged ? "danger" : "primary"}
            onClick={() => { void handleTrust(); }}
            disabled={confirming}
          >
            {isKeyChanged ? "Trust New Key" : "Trust & Connect"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {isKeyChanged ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3">
            <p className="text-sm font-semibold text-danger">
              The host key for this server has changed!
            </p>
            <p className="mt-1 text-xs text-danger/80">
              This could indicate a man-in-the-middle attack, or the server may
              have been reconfigured. Do not connect unless you are certain the
              server&apos;s key was intentionally changed.
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            The authenticity of this host cannot be established. You are
            connecting to this server for the first time.
          </p>
        )}

        <div className="rounded-lg border border-border bg-base-700/50 p-3 font-mono text-xs">
          <div className="grid gap-1.5">
            <div className="flex gap-2">
              <span className="text-text-muted">Host:</span>
              <span className="text-text-primary">
                {info.hostname}:{info.port}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-muted">Algorithm:</span>
              <span className="text-text-primary">{info.algorithm}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-text-muted">Fingerprint:</span>
              <span className="text-accent break-all">{info.fingerprint}</span>
            </div>
            {isKeyChanged && info.previousFingerprint ? (
              <div className="flex gap-2">
                <span className="text-text-muted">Previous:</span>
                <span className="text-danger break-all">
                  {info.previousFingerprint}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-xs text-text-muted">
          {isKeyChanged
            ? "If you trust this new key, the old fingerprint will be replaced."
            : "If you trust this host, the fingerprint will be saved for future connections."}
        </p>
      </div>
    </Modal>
  );
}
