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
  submitLabel?: string;
  availablePorts?: string[];
  onRefreshPorts?: () => void;
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

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

export function SerialProfileForm({
  initialValue,
  onSubmit,
  submitLabel = "Save serial profile",
  availablePorts,
  onRefreshPorts
}: SerialProfileFormProps) {
  const formId = useId();
  const [value, setValue] = useState<SerialProfileFormValue>({
    ...defaultValue,
    ...initialValue
  });

  const portListId = `${formId}-port-list`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-5"
    >
      <label htmlFor={`${formId}-name`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Name</span>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          className={inputClasses}
        />
      </label>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Port</span>
        <div className="flex gap-2">
          <input
            id={`${formId}-path`}
            list={availablePorts && availablePorts.length > 0 ? portListId : undefined}
            value={value.path}
            onChange={(e) => setValue({ ...value, path: e.target.value })}
            placeholder="COM3 or /dev/ttyUSB0"
            className={inputClasses}
          />
          {availablePorts && availablePorts.length > 0 && (
            <datalist id={portListId}>
              {availablePorts.map((port) => (
                <option key={port} value={port} />
              ))}
            </datalist>
          )}
          {onRefreshPorts && (
            <button
              type="button"
              onClick={onRefreshPorts}
              className="shrink-0 rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-secondary hover:border-border-bright hover:text-text-primary transition-all duration-150"
              title="Refresh ports"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-baudRate`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Baud Rate</span>
          <select
            id={`${formId}-baudRate`}
            value={value.baudRate}
            onChange={(e) => setValue({ ...value, baudRate: Number(e.target.value) })}
            className={inputClasses}
          >
            {[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((rate) => (
              <option key={rate} value={rate}>{rate}</option>
            ))}
          </select>
        </label>

        <label htmlFor={`${formId}-dataBits`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Data Bits</span>
          <select
            id={`${formId}-dataBits`}
            value={value.dataBits}
            onChange={(e) => setValue({ ...value, dataBits: Number(e.target.value) as 5 | 6 | 7 | 8 })}
            className={inputClasses}
          >
            {([5, 6, 7, 8] as const).map((bits) => (
              <option key={bits} value={bits}>{bits}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-stopBits`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Stop Bits</span>
          <select
            id={`${formId}-stopBits`}
            value={value.stopBits}
            onChange={(e) => setValue({ ...value, stopBits: Number(e.target.value) as 1 | 2 })}
            className={inputClasses}
          >
            {([1, 2] as const).map((bits) => (
              <option key={bits} value={bits}>{bits}</option>
            ))}
          </select>
        </label>

        <label htmlFor={`${formId}-parity`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Parity</span>
          <select
            id={`${formId}-parity`}
            value={value.parity}
            onChange={(e) => setValue({ ...value, parity: e.target.value as SerialProfileFormValue["parity"] })}
            className={inputClasses}
          >
            {(["none", "even", "odd", "mark", "space"] as const).map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </label>
      </div>

      <label htmlFor={`${formId}-flowControl`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Flow Control</span>
        <select
          id={`${formId}-flowControl`}
          value={value.flowControl}
          onChange={(e) => setValue({ ...value, flowControl: e.target.value as SerialProfileFormValue["flowControl"] })}
          className={inputClasses}
        >
          {(["none", "hardware", "software"] as const).map((fc) => (
            <option key={fc} value={fc}>{fc.charAt(0).toUpperCase() + fc.slice(1)}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-5">
        <label htmlFor={`${formId}-localEcho`} className="flex items-center gap-2 cursor-pointer">
          <input
            id={`${formId}-localEcho`}
            type="checkbox"
            checked={value.localEcho}
            onChange={(e) => setValue({ ...value, localEcho: e.target.checked })}
            className="rounded border-border accent-accent"
          />
          <span className="text-xs font-medium text-text-secondary">Local Echo</span>
        </label>

        <label htmlFor={`${formId}-dtr`} className="flex items-center gap-2 cursor-pointer">
          <input
            id={`${formId}-dtr`}
            type="checkbox"
            checked={value.dtr}
            onChange={(e) => setValue({ ...value, dtr: e.target.checked })}
            className="rounded border-border accent-accent"
          />
          <span className="text-xs font-medium text-text-secondary">DTR</span>
        </label>

        <label htmlFor={`${formId}-rts`} className="flex items-center gap-2 cursor-pointer">
          <input
            id={`${formId}-rts`}
            type="checkbox"
            checked={value.rts}
            onChange={(e) => setValue({ ...value, rts: e.target.checked })}
            className="rounded border-border accent-accent"
          />
          <span className="text-xs font-medium text-text-secondary">RTS</span>
        </label>
      </div>

      <button
        type="submit"
        className="justify-self-start rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 active:bg-accent/30 transition-all duration-150"
      >
        {submitLabel}
      </button>
    </form>
  );
}
