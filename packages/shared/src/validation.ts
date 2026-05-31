// Host field validators shared between the UI (form-level checks) and any other
// layer that needs to validate a hostname/port. The Zod host schemas stay
// intentionally permissive (z.string().min(1) / positive int) so paths that
// bypass the form — e.g. SSH-config import — are not rejected; these stricter
// checks gate user-entered values in the form.

export const HOSTNAME_REGEX =
  /^(?:localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;

export const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export const IPV6_REGEX = /^\[?[0-9a-fA-F:]+\]?$/;

export function isValidHostname(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return HOSTNAME_REGEX.test(v) || IPV4_REGEX.test(v) || IPV6_REGEX.test(v);
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
