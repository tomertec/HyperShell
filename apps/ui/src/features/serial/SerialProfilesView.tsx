import { useCallback, useEffect, useMemo, useState } from "react";

import type { SerialProfileRecord } from "@hypershell/shared";

import { SerialProfileForm, type SerialProfileFormValue } from "./SerialProfileForm";

export function SerialProfilesView() {
  const [profiles, setProfiles] = useState<SerialProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);

  useEffect(() => {
    window.hypershell?.listSerialProfiles?.().then(setProfiles).catch(console.error);
  }, []);

  const refreshPorts = useCallback(() => {
    window.hypershell
      ?.listSerialPorts?.()
      .then((ports) => setAvailablePorts(ports.map((p) => p.path)))
      .catch(console.error);
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  function handleSubmit(value: SerialProfileFormValue) {
    const id = selectedProfile?.id ?? `serial-${Date.now()}`;
    window.hypershell
      ?.upsertSerialProfile?.({
        id,
        name: value.name,
        path: value.path,
        baudRate: value.baudRate,
        dataBits: value.dataBits,
        stopBits: value.stopBits,
        parity: value.parity,
        flowControl: value.flowControl,
        localEcho: value.localEcho,
        dtr: value.dtr,
        rts: value.rts
      })
      .then((saved) => {
        setProfiles((current) => {
          const index = current.findIndex((p) => p.id === saved.id);
          if (index === -1) {
            return [...current, saved];
          }
          const copy = current.slice();
          copy[index] = saved;
          return copy;
        });
        setSelectedId(saved.id);
      })
      .catch(console.error);
  }

  function handleDelete() {
    if (!selectedProfile) return;
    if (!window.confirm(`Delete profile "${selectedProfile.name}"?`)) return;
    window.hypershell
      ?.removeSerialProfile?.({ id: selectedProfile.id })
      .then(() => {
        setProfiles((current) => current.filter((p) => p.id !== selectedProfile.id));
        setSelectedId("");
      })
      .catch(console.error);
  }

  const initialFormValue: Partial<SerialProfileFormValue> | undefined = selectedProfile
    ? {
        name: selectedProfile.name,
        path: selectedProfile.path,
        baudRate: selectedProfile.baudRate,
        dataBits: selectedProfile.dataBits as 5 | 6 | 7 | 8,
        stopBits: selectedProfile.stopBits as 1 | 2,
        parity: selectedProfile.parity as SerialProfileFormValue["parity"],
        flowControl: selectedProfile.flowControl as SerialProfileFormValue["flowControl"],
        localEcho: selectedProfile.localEcho,
        dtr: selectedProfile.dtr,
        rts: selectedProfile.rts
      }
    : undefined;

  return (
    <section className="rounded-xl border border-border bg-base-800/90 p-5">
      <header>
        <h2 className="text-lg font-semibold text-text-primary">Serial Profiles</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Manage serial port connections and configure port settings.
        </p>
        <button
          onClick={() => setSelectedId("")}
          className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 hover:border-accent/40 active:bg-accent/30 transition-all duration-150 cursor-pointer"
        >
          New profile
        </button>
      </header>

      <div className="grid grid-cols-[1.2fr_0.8fr] gap-5 mt-5">
        {/* Left: profile list */}
        <div className="grid gap-3 content-start">
          {profiles.length === 0 ? (
            <p className="text-sm text-text-secondary">No profiles yet. Create one to get started.</p>
          ) : (
            profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setSelectedId(profile.id)}
                className={[
                  "text-left rounded-lg border p-3.5 cursor-pointer transition-all duration-150",
                  profile.id === selectedId
                    ? "border-accent/45 bg-accent/10"
                    : "border-border bg-surface/60 hover:border-border-bright hover:bg-surface/80"
                ].join(" ")}
              >
                <div className="flex justify-between gap-3">
                  <strong className="text-text-primary font-semibold">{profile.name}</strong>
                  <span className="text-text-secondary text-sm shrink-0">
                    {profile.path}:{profile.baudRate}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-text-secondary">
                  Parity: {profile.parity} &bull; Flow: {profile.flowControl}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: form + delete */}
        <div className="grid gap-4 content-start">
          <SerialProfileForm
            key={selectedProfile?.id ?? "new"}
            initialValue={initialFormValue}
            submitLabel={selectedProfile ? "Update profile" : "Add profile"}
            availablePorts={availablePorts}
            onRefreshPorts={refreshPorts}
            onSubmit={handleSubmit}
          />

          {selectedProfile ? (
            <button
              onClick={handleDelete}
              className="justify-self-start rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/40 active:bg-red-500/25 transition-all duration-150 cursor-pointer"
            >
              Delete profile
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
