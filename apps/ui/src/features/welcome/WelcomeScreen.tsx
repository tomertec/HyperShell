import { useState, useCallback } from "react";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import { motion } from "framer-motion";
import type { LocalProfileRecord } from "@hypershell/shared";
import { Button } from "../../components/ui/Button";
import { Kbd } from "../../components/ui/Kbd";
import { MOTION_SLOW, EASE_STANDARD } from "../../lib/motion";
import { LocalProfileIcon } from "../local/LocalProfileIcon";
import { AnimatedLogo } from "./AnimatedLogo";
import { QuickConnectForm, type SerialAdvancedOptions } from "./QuickConnectForm";

interface WelcomeScreenProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: SerialAdvancedOptions) => void;
  localProfiles: LocalProfileRecord[];
  onConnectLocal: (profile: LocalProfileRecord) => void;
}

export function WelcomeScreen({
  availablePorts,
  onRefreshPorts,
  onConnectSsh,
  onConnectSerial,
  localProfiles,
  onConnectLocal,
}: WelcomeScreenProps) {
  const [formOpen, setFormOpen] = useState(false);

  const handleCancel = useCallback(() => setFormOpen(false), []);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center text-text-secondary">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-900 via-base-900 to-base-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_40%,rgba(56,189,248,0.03),transparent)]" />

      <div className="relative flex flex-col items-center gap-6">
        <h1 className="sr-only">HyperShell</h1>
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
                transition={{ duration: MOTION_SLOW, ease: EASE_STANDARD }}
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

        {localProfiles.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
            {localProfiles.map((profile) => (
              <Button
                key={profile.id}
                variant="outline"
                size="sm"
                shape="pill"
                onClick={() => onConnectLocal(profile)}
              >
                <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0" />
                <span>{profile.name}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Keyboard shortcut hint - only when form is closed */}
        {!formOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, duration: 0.5 }}
            className="text-xs text-text-muted mt-2"
          >
            or press{" "}
            <Kbd>Ctrl+K</Kbd>{" "}
            to search hosts
          </motion.div>
        )}
      </div>
    </div>
  );
}
