import { useState, useCallback } from "react";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import { motion } from "framer-motion";
import { AnimatedLogo } from "./AnimatedLogo";
import { QuickConnectForm, type SerialAdvancedOptions } from "./QuickConnectForm";

interface WelcomeScreenProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: SerialAdvancedOptions) => void;
}

export function WelcomeScreen({
  availablePorts,
  onRefreshPorts,
  onConnectSsh,
  onConnectSerial,
}: WelcomeScreenProps) {
  const [formOpen, setFormOpen] = useState(false);

  const handleCancel = useCallback(() => setFormOpen(false), []);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center text-text-secondary">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-900 via-base-900 to-base-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_40%,rgba(56,189,248,0.03),transparent)]" />

      <div className="relative flex flex-col items-center gap-6">
        <LayoutGroup>
          <AnimatedLogo
            compact={formOpen}
            onClick={() => setFormOpen((v) => !v)}
          />

          <AnimatePresence>
            {formOpen && (
              <motion.div
                layout
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <QuickConnectForm
                  availablePorts={availablePorts}
                  onRefreshPorts={onRefreshPorts}
                  onConnectSsh={onConnectSsh}
                  onConnectSerial={onConnectSerial}
                  onCancel={handleCancel}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>

        {/* Keyboard shortcut hint - only when form is closed */}
        {!formOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, duration: 0.5 }}
            className="text-xs text-text-muted mt-2"
          >
            or press{" "}
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-base-700/80 text-text-secondary text-[11px] border border-border/50 font-medium">
              Ctrl+K
            </kbd>{" "}
            to search hosts
          </motion.div>
        )}
      </div>
    </div>
  );
}
