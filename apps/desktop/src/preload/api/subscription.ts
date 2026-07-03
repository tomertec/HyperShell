import type { ZodType } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

export function assertListener(value: unknown, methodName: string): asserts value is Function {
  if (typeof value === "function") {
    return;
  }

  throw new TypeError(`${methodName} listener must be a function`);
}

export function createSubscription<T>(
  ipcRenderer: PreloadIpcRenderer,
  logger: PreloadLogger,
  channel: string,
  name: string,
  label?: string,
  schema?: ZodType<T>,
) {
  const diagnosticName = label ?? name;

  return (listener: (payload: T) => void) => {
    assertListener(listener, name);

    const wrappedListener = (_event: unknown, payload: unknown) => {
      if (schema) {
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          logger.warn?.(`Ignored invalid ${diagnosticName} payload from IPC`, parsed.error);
          return;
        }

        try {
          listener(parsed.data);
        } catch (error) {
          logger.error?.(`${diagnosticName} listener threw`, error);
        }
        return;
      }

      try {
        listener(payload as T);
      } catch (error) {
        logger.error?.(`${diagnosticName} listener threw`, error);
      }
    };

    ipcRenderer.on(channel, wrappedListener);

    return () => {
      ipcRenderer.removeListener(channel, wrappedListener);
    };
  };
}
