import { useId, useState } from "react";

export type PortForwardProtocol = "local" | "remote" | "dynamic";

export type PortForwardProfileValue = {
  name: string;
  protocol: PortForwardProtocol;
  localAddress: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  description: string;
};

export interface PortForwardProfileFormProps {
  initialValue?: Partial<PortForwardProfileValue>;
  onSubmit: (value: PortForwardProfileValue) => void;
}

const defaultValue: PortForwardProfileValue = {
  name: "",
  protocol: "local",
  localAddress: "127.0.0.1",
  localPort: 8080,
  remoteHost: "",
  remotePort: 80,
  description: ""
};

export function PortForwardProfileForm({
  initialValue,
  onSubmit
}: PortForwardProfileFormProps) {
  const formId = useId();
  const [value, setValue] = useState<PortForwardProfileValue>({
    ...defaultValue,
    ...initialValue
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-3 p-4 rounded-2xl border border-border bg-base-800/95 text-text-primary"
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Port forwarding profile</h2>

      <label htmlFor={`${formId}-name`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">Name</div>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
        />
      </label>

      <label htmlFor={`${formId}-protocol`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">Protocol</div>
        <select
          id={`${formId}-protocol`}
          value={value.protocol}
          onChange={(event) =>
            setValue({ ...value, protocol: event.target.value as PortForwardProtocol })
          }
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
        >
          <option value="local">Local</option>
          <option value="remote">Remote</option>
          <option value="dynamic">Dynamic (SOCKS)</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-localAddress`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">Local address</div>
          <input
            id={`${formId}-localAddress`}
            value={value.localAddress}
            onChange={(event) =>
              setValue({ ...value, localAddress: event.target.value })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>

        <label htmlFor={`${formId}-localPort`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">Local port</div>
          <input
            id={`${formId}-localPort`}
            type="number"
            value={value.localPort}
            onChange={(event) =>
              setValue({ ...value, localPort: Number(event.target.value) || 0 })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-remoteHost`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">Remote host</div>
          <input
            id={`${formId}-remoteHost`}
            value={value.remoteHost}
            onChange={(event) =>
              setValue({ ...value, remoteHost: event.target.value })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>

        <label htmlFor={`${formId}-remotePort`} className="grid gap-1.5 text-text-secondary">
          <div className="text-[13px] text-text-secondary">Remote port</div>
          <input
            id={`${formId}-remotePort`}
            type="number"
            value={value.remotePort}
            onChange={(event) =>
              setValue({ ...value, remotePort: Number(event.target.value) || 0 })
            }
            className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
          />
        </label>
      </div>

      <label htmlFor={`${formId}-description`} className="grid gap-1.5 text-text-secondary">
        <div className="text-[13px] text-text-secondary">Description</div>
        <textarea
          id={`${formId}-description`}
          value={value.description}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
          rows={3}
          style={{ resize: "vertical" }}
          className="w-full rounded-[10px] border border-border bg-base-900 text-text-primary px-3 py-2.5"
        />
      </label>

      <button type="submit" className="rounded-[10px] border border-accent-dim bg-accent/15 text-accent px-3.5 py-2.5 cursor-pointer justify-self-start">
        Save profile
      </button>
    </form>
  );
}
