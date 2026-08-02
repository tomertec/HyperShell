import { describe, expect, it } from "vitest";
import { detectLocalShells, parseWslDistros } from "./detectLocalShells";
import type { DetectProbes } from "./detectLocalShells";

function windowsProbes(overrides: Partial<DetectProbes> = {}): DetectProbes {
  const present = new Set([
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "C:\\Windows\\System32\\cmd.exe",
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    "C:\\Program Files\\Git\\bin\\bash.exe"
  ]);

  return {
    platform: "win32",
    env: {
      SystemRoot: "C:\\Windows",
      ProgramFiles: "C:\\Program Files"
    },
    fileExists: (candidate) => present.has(candidate),
    runCommand: () => null,
    ...overrides
  };
}

describe("parseWslDistros", () => {
  it("decodes UTF-16LE output from wsl -l -q", () => {
    const stdout = Buffer.from("Ubuntu-22.04\r\nDebian\r\n", "utf16le");

    expect(parseWslDistros(stdout)).toEqual(["Ubuntu-22.04", "Debian"]);
  });

  it("returns an empty list for empty output", () => {
    expect(parseWslDistros(Buffer.from("", "utf16le"))).toEqual([]);
  });

  it("does not mistake UTF-16 padding for distro names", () => {
    const stdout = Buffer.from("Ubuntu\r\n", "utf16le");

    expect(parseWslDistros(stdout).every((name) => !name.includes("\u0000"))).toBe(true);
  });
});

describe("detectLocalShells", () => {
  it("finds the standard Windows shells", () => {
    const shells = detectLocalShells(windowsProbes());
    const keys = shells.map((shell) => shell.detectKey);

    expect(keys).toContain("windows-powershell");
    expect(keys).toContain("pwsh7");
    expect(keys).toContain("cmd");
    expect(keys).toContain("git-bash");
  });

  it("gives every detected shell empty args so it loads its own profile", () => {
    for (const shell of detectLocalShells(windowsProbes())) {
      expect(shell.args).toEqual([]);
    }
  });

  it("assigns the right icon per shell", () => {
    const shells = detectLocalShells(windowsProbes());
    const byKey = Object.fromEntries(shells.map((s) => [s.detectKey, s.icon]));

    expect(byKey["windows-powershell"]).toBe("powershell");
    expect(byKey.pwsh7).toBe("powershell");
    expect(byKey.cmd).toBe("cmd");
    expect(byKey["git-bash"]).toBe("bash");
  });

  it("omits shells that are not installed", () => {
    const probes = windowsProbes({ fileExists: () => false });

    expect(detectLocalShells(probes)).toEqual([]);
  });

  it("adds one profile per WSL distro", () => {
    const probes = windowsProbes({
      runCommand: (file, args) =>
        file.toLowerCase().includes("wsl") && args.includes("-q")
          ? Buffer.from("Ubuntu-22.04\r\nDebian\r\n", "utf16le")
          : null
    });

    const shells = detectLocalShells(probes);
    const ubuntu = shells.find((s) => s.detectKey === "wsl:Ubuntu-22.04");

    expect(ubuntu).toBeDefined();
    expect(ubuntu?.name).toBe("Ubuntu-22.04 (WSL)");
    expect(ubuntu?.args).toEqual(["-d", "Ubuntu-22.04"]);
    expect(ubuntu?.icon).toBe("linux");
    expect(shells.some((s) => s.detectKey === "wsl:Debian")).toBe(true);
  });

  it("excludes Docker Desktop internal distros from WSL profiles", () => {
    const probes = windowsProbes({
      runCommand: (file, args) =>
        file.toLowerCase().includes("wsl") && args.includes("-q")
          ? Buffer.from("Ubuntu-22.04\r\ndocker-desktop\r\nDebian\r\ndocker-desktop-data\r\n", "utf16le")
          : null
    });

    const shells = detectLocalShells(probes);
    const distroKeys = shells.filter((s) => s.detectKey.startsWith("wsl:")).map((s) => s.detectKey);

    expect(distroKeys).toContain("wsl:Ubuntu-22.04");
    expect(distroKeys).toContain("wsl:Debian");
    expect(distroKeys).not.toContain("wsl:docker-desktop");
    expect(distroKeys).not.toContain("wsl:docker-desktop-data");
  });

  it("falls back to $SHELL on non-Windows platforms", () => {
    const shells = detectLocalShells({
      platform: "linux",
      env: { SHELL: "/bin/zsh" },
      fileExists: (candidate) => candidate === "/bin/zsh",
      runCommand: () => null
    });

    expect(shells).toEqual([
      { detectKey: "default-shell", name: "zsh", executable: "/bin/zsh", args: [], icon: "terminal" }
    ]);
  });
});
