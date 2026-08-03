import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../layout/Modal";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import type { KeyboardInteractiveRequest } from "@hypershell/shared";

interface KeyboardInteractiveDialogProps {
  request: KeyboardInteractiveRequest | null;
  onSubmit: (requestId: string, responses: string[]) => void;
  onCancel: (requestId: string) => void;
}

export function KeyboardInteractiveDialog({
  request,
  onSubmit,
  onCancel,
}: KeyboardInteractiveDialogProps) {
  const [responses, setResponses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset state when a new request arrives
  useEffect(() => {
    if (request) {
      setResponses(request.prompts.map(() => ""));
      setSubmitting(false);
      setTimeLeft(60);
    }
  }, [request]);

  // Focus first input when dialog opens
  useEffect(() => {
    if (request) {
      // Small delay to let the modal render
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [request]);

  // Countdown timer
  useEffect(() => {
    if (!request) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onCancel(request.requestId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [request, onCancel]);

  const handleResponseChange = useCallback(
    (index: number, value: string) => {
      setResponses((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!request || submitting) return;
    setSubmitting(true);
    onSubmit(request.requestId, responses);
  }, [request, responses, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (!request) return;
    onCancel(request.requestId);
  }, [request, onCancel]);

  if (!request) return null;

  const hasName = request.name && request.name.length > 0;
  const hasInstructions = request.instructions && request.instructions.length > 0;

  return (
    <Modal
      open={!!request}
      onClose={handleCancel}
      title="Authentication Required"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        {hasName && (
          <p className="text-sm font-medium text-text-primary">{request.name}</p>
        )}

        {hasInstructions && (
          <p className="text-xs text-text-muted">{request.instructions}</p>
        )}

        {!hasName && !hasInstructions && (
          <p className="text-xs text-text-muted">
            The server is requesting additional authentication.
          </p>
        )}

        {request.prompts.map((prompt, index) => (
          <label key={index} className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {prompt.prompt.replace(/:?\s*$/, "")}
            </span>
            <Input
              ref={index === 0 ? firstInputRef : undefined}
              type={prompt.echo ? "text" : "password"}
              value={responses[index] ?? ""}
              onChange={(e) => handleResponseChange(index, e.target.value)}
              autoComplete={prompt.echo ? "off" : "current-password"}
              disabled={submitting}
            />
          </label>
        ))}

        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted tabular-nums">
            {timeLeft}s remaining
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
