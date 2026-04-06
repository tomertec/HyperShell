export type SshConfigHost = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  extraOptions: Record<string, string>;
};

type SshConfigBlock = {
  aliases: string[];
  options: Omit<SshConfigHost, "alias" | "extraOptions"> & {
    extraOptions: Record<string, string>;
  };
};

export type ParseSshConfigResult = {
  hosts: SshConfigHost[];
};

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function parseHostPattern(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "*");
}

export function parseSshConfig(input: string): ParseSshConfigResult {
  const blocks: SshConfigBlock[] = [];
  let current: SshConfigBlock | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    if (isCommentOrBlank(rawLine)) {
      continue;
    }

    const line = rawLine.trim();
    const [directive, ...rest] = line.split(/\s+/);
    const value = rest.join(" ").trim();

    if (!directive || !value) {
      continue;
    }

    if (directive.toLowerCase() === "host") {
      const aliases = parseHostPattern(value);

      current = aliases.length > 0
        ? {
            aliases,
            options: {
              extraOptions: {}
            }
          }
        : null;

      if (current) {
        blocks.push(current);
      }
      continue;
    }

    if (!current) {
      continue;
    }

    const normalizedDirective = directive.toLowerCase();

    if (normalizedDirective === "hostname") {
      current.options.hostName = value;
      continue;
    }

    if (normalizedDirective === "user") {
      current.options.user = value;
      continue;
    }

    if (normalizedDirective === "port") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        current.options.port = parsed;
      }
      continue;
    }

    if (normalizedDirective === "identityfile") {
      current.options.identityFile = value;
      continue;
    }

    if (normalizedDirective === "proxyjump") {
      current.options.proxyJump = value;
      continue;
    }

    current.options.extraOptions[directive] = value;
  }

  const hosts = blocks.flatMap(({ aliases, options }) =>
    aliases.map((alias) => ({
      alias,
      hostName: options.hostName,
      user: options.user,
      port: options.port,
      identityFile: options.identityFile,
      proxyJump: options.proxyJump,
      extraOptions: { ...options.extraOptions }
    }))
  );

  return {
    hosts
  };
}
