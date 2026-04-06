import { useId, useState } from "react";

export interface SerialProfileFormValue {
  name: string;
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd" | "mark" | "space";
  flowControl: "none" | "hardware" | "software";
  localEcho: boolean;
  dtr: boolean;
  rts: boolean;
}

export interface SerialProfileFormProps {
  initialValue?: Partial<SerialProfileFormValue>;
  onSubmit: (value: SerialProfileFormValue) => void;
}

const defaultValue: SerialProfileFormValue = {
  name: "",
  path: "",
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
  localEcho: false,
  dtr: true,
  rts: true
};

export function SerialProfileForm({
  initialValue,
  onSubmit
}: SerialProfileFormProps) {
  const formId = useId();
  const [value, setValue] = useState<SerialProfileFormValue>({
    ...defaultValue,
    ...initialValue
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 16,
        background: "rgba(15, 23, 42, 0.92)",
        color: "#e2e8f0"
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Serial profile</h2>

      <label htmlFor={`${formId}-name`}>
        <div>Name</div>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>

      <label htmlFor={`${formId}-path`}>
        <div>Port</div>
        <input
          id={`${formId}-path`}
          value={value.path}
          onChange={(event) => setValue({ ...value, path: event.target.value })}
          placeholder="COM3 or /dev/ttyUSB0"
        />
      </label>

      <button type="submit">Save serial profile</button>
    </form>
  );
}
