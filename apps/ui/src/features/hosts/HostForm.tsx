import { useEffect, useId, useState } from "react";

export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  group: string;
  tags: string;
};

export interface HostFormProps {
  initialValue?: Partial<HostFormValue>;
  submitLabel?: string;
  onSubmit: (value: HostFormValue) => void;
}

const defaultValue: HostFormValue = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
  group: "",
  tags: ""
};

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

export function HostForm({
  initialValue,
  submitLabel = "Save host",
  onSubmit
}: HostFormProps) {
  const formId = useId();
  const [value, setValue] = useState<HostFormValue>({
    ...defaultValue,
    ...initialValue
  });

  useEffect(() => {
    setValue({ ...defaultValue, ...initialValue });
  }, [initialValue]);

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

      <label htmlFor={`${formId}-hostname`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Hostname</span>
        <input
          id={`${formId}-hostname`}
          value={value.hostname}
          onChange={(e) => setValue({ ...value, hostname: e.target.value })}
          placeholder="web-01.example.com"
          className={inputClasses}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-port`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Port</span>
          <input
            id={`${formId}-port`}
            type="number"
            value={value.port}
            onChange={(e) => setValue({ ...value, port: Number(e.target.value) || 22 })}
            className={inputClasses}
          />
        </label>
        <label htmlFor={`${formId}-username`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Username</span>
          <input
            id={`${formId}-username`}
            value={value.username}
            onChange={(e) => setValue({ ...value, username: e.target.value })}
            className={inputClasses}
          />
        </label>
      </div>

      <label htmlFor={`${formId}-group`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Group</span>
        <input
          id={`${formId}-group`}
          value={value.group}
          onChange={(e) => setValue({ ...value, group: e.target.value })}
          className={inputClasses}
        />
      </label>

      <label htmlFor={`${formId}-tags`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Tags</span>
        <input
          id={`${formId}-tags`}
          value={value.tags}
          onChange={(e) => setValue({ ...value, tags: e.target.value })}
          placeholder="prod, linux, db"
          className={inputClasses}
        />
      </label>

      <button
        type="submit"
        className="justify-self-start rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 active:bg-accent/30 transition-all duration-150"
      >
        {submitLabel}
      </button>
    </form>
  );
}
