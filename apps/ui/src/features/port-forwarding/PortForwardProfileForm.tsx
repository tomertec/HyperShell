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
      style={formStyle}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Port forwarding profile</h2>

      <label htmlFor={`${formId}-name`} style={labelStyle}>
        <div style={labelTitleStyle}>Name</div>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
          style={inputStyle}
        />
      </label>

      <label htmlFor={`${formId}-protocol`} style={labelStyle}>
        <div style={labelTitleStyle}>Protocol</div>
        <select
          id={`${formId}-protocol`}
          value={value.protocol}
          onChange={(event) =>
            setValue({ ...value, protocol: event.target.value as PortForwardProtocol })
          }
          style={inputStyle}
        >
          <option value="local">Local</option>
          <option value="remote">Remote</option>
          <option value="dynamic">Dynamic (SOCKS)</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-localAddress`} style={labelStyle}>
          <div style={labelTitleStyle}>Local address</div>
          <input
            id={`${formId}-localAddress`}
            value={value.localAddress}
            onChange={(event) =>
              setValue({ ...value, localAddress: event.target.value })
            }
            style={inputStyle}
          />
        </label>

        <label htmlFor={`${formId}-localPort`} style={labelStyle}>
          <div style={labelTitleStyle}>Local port</div>
          <input
            id={`${formId}-localPort`}
            type="number"
            value={value.localPort}
            onChange={(event) =>
              setValue({ ...value, localPort: Number(event.target.value) || 0 })
            }
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label htmlFor={`${formId}-remoteHost`} style={labelStyle}>
          <div style={labelTitleStyle}>Remote host</div>
          <input
            id={`${formId}-remoteHost`}
            value={value.remoteHost}
            onChange={(event) =>
              setValue({ ...value, remoteHost: event.target.value })
            }
            style={inputStyle}
          />
        </label>

        <label htmlFor={`${formId}-remotePort`} style={labelStyle}>
          <div style={labelTitleStyle}>Remote port</div>
          <input
            id={`${formId}-remotePort`}
            type="number"
            value={value.remotePort}
            onChange={(event) =>
              setValue({ ...value, remotePort: Number(event.target.value) || 0 })
            }
            style={inputStyle}
          />
        </label>
      </div>

      <label htmlFor={`${formId}-description`} style={labelStyle}>
        <div style={labelTitleStyle}>Description</div>
        <textarea
          id={`${formId}-description`}
          value={value.description}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      <button type="submit" style={buttonStyle}>
        Save profile
      </button>
    </form>
  );
}

const formStyle = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.92)",
  color: "#e2e8f0"
} as const;

const labelStyle = {
  display: "grid",
  gap: 6,
  color: "#cbd5e1"
} as const;

const labelTitleStyle = {
  fontSize: 13,
  color: "#cbd5e1"
} as const;

const inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(2, 6, 23, 0.9)",
  color: "#e2e8f0",
  padding: "10px 12px"
} as const;

const buttonStyle = {
  borderRadius: 10,
  border: "1px solid rgba(125, 211, 252, 0.35)",
  background: "rgba(8, 47, 73, 0.8)",
  color: "#e0f2fe",
  padding: "10px 14px",
  cursor: "pointer",
  justifySelf: "start"
} as const;
