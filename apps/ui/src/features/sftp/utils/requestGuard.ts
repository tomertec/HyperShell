export interface RequestGuard {
  /** Claims the next token and supersedes every earlier one. */
  begin: () => number;
  /** True only for the most recently issued token. */
  isCurrent: (token: number) => boolean;
}

/**
 * Monotonic request tokens for a single pane.
 *
 * Directory listings resolve out of order — navigate quickly and the slower
 * response for the previous path lands last, painting files that belong to a
 * directory the user already left. Results, errors, and loading transitions
 * must all be gated on the token still being current.
 */
export function createRequestGuard(): RequestGuard {
  let latest = 0;

  return {
    begin: () => {
      latest += 1;
      return latest;
    },
    isCurrent: (token: number) => token === latest
  };
}
