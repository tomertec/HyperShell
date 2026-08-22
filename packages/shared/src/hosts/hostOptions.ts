import {
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS
} from "../ipc/schemas";

/**
 * The single owner of every host option's default value. Keys are HostRecord
 * field names.
 *
 * The SQLite column defaults must agree with these values — enforced by the
 * "hosts table DDL defaults agree with HOST_OPTION_DEFAULTS" test in
 * packages/db/src/repositories/hostsRepository.test.ts. Every store and the
 * host form read defaults from here; do not write a host default anywhere else.
 */
export const HOST_OPTION_DEFAULTS = {
  port: 22,
  authMethod: "default",
  agentKind: "system",
  isFavorite: false,
  autoReconnect: false,
  reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
  reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
  tmuxDetect: false,
  shellIntegration: true,
} as const;
