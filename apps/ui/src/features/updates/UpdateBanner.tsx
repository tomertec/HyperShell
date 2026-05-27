import { AnimatePresence, motion } from "framer-motion";

import { shouldShowBanner, useUpdateStore } from "./updateStore";

export function UpdateBanner() {
  const update = useUpdateStore((s) => s.update);
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const download = useUpdateStore((s) => s.download);
  const install = useUpdateStore((s) => s.install);
  const openRelease = useUpdateStore((s) => s.openRelease);

  const visible = shouldShowBanner(update, dismissedVersion);

  return (
    <AnimatePresence>
      {visible && update ? (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-base-700 px-4 py-2 text-sm text-text-primary shadow-lg"
          role="status"
        >
          {update.status === "available" ? (
            <>
              <span>
                HyperShell{" "}
                <strong>v{update.availableVersion}</strong> is available
              </span>
              <button
                type="button"
                onClick={() => void download()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Download
              </button>
            </>
          ) : null}

          {update.status === "downloading" ? (
            <span>
              Downloading update… {update.progressPercent ?? 0}%
            </span>
          ) : null}

          {update.status === "downloaded" ? (
            <>
              <span>
                Update <strong>v{update.availableVersion}</strong> ready
              </span>
              <button
                type="button"
                onClick={() => void install()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Restart &amp; install
              </button>
            </>
          ) : null}

          {update.status === "manual-available" ? (
            <>
              <span>
                HyperShell <strong>v{update.availableVersion}</strong> is available
              </span>
              <button
                type="button"
                onClick={() => void openRelease()}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
              >
                Download
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update notification"
            className="ml-1 text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
