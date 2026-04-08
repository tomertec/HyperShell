import { describe, expect, it } from "vitest";
import { openDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createHostEnvVarRepositoryFromDatabase } from "./hostEnvVarRepository";

describe("hostEnvVarRepository", () => {
  function setup() {
    const db = openDatabase(":memory:");
    const hosts = createHostsRepositoryFromDatabase(db);
    const envVars = createHostEnvVarRepositoryFromDatabase(db);

    hosts.create({ id: "h1", name: "web", hostname: "web.example.com" });
    hosts.create({ id: "h2", name: "db", hostname: "db.example.com" });

    return { hosts, envVars };
  }

  it("upserts and lists env vars for a host in sort order", () => {
    const { envVars } = setup();

    envVars.upsert({
      id: "env2",
      hostId: "h1",
      name: "LANG",
      value: "en_US.UTF-8",
      sortOrder: 1,
    });
    envVars.upsert({
      id: "env1",
      hostId: "h1",
      name: "TERM",
      value: "xterm-256color",
      sortOrder: 0,
    });

    const list = envVars.listByHost("h1");
    expect(list).toHaveLength(2);
    expect(list.map((item) => item.name)).toEqual(["TERM", "LANG"]);
  });

  it("replaces all env vars for a host", () => {
    const { envVars } = setup();

    envVars.upsert({
      id: "old",
      hostId: "h1",
      name: "OLD",
      value: "1",
      sortOrder: 0,
    });

    const replaced = envVars.replaceForHost("h1", [
      { id: "new1", hostId: "h1", name: "TERM", value: "xterm-256color" },
      { id: "new2", hostId: "h1", name: "LANG", value: "C.UTF-8", isEnabled: false },
    ]);

    expect(replaced).toHaveLength(2);
    expect(envVars.listByHost("h1").map((item) => item.id)).toEqual(["new1", "new2"]);
  });

  it("returns only enabled + valid env names in env map", () => {
    const { envVars } = setup();

    envVars.replaceForHost("h1", [
      { id: "e1", hostId: "h1", name: "TERM", value: "xterm-256color", isEnabled: true },
      { id: "e2", hostId: "h1", name: "BAD-NAME", value: "x", isEnabled: true },
      { id: "e3", hostId: "h1", name: "LANG", value: "en_US.UTF-8", isEnabled: false },
    ]);

    expect(envVars.toEnabledEnvMap("h1")).toEqual({
      TERM: "xterm-256color",
    });
  });

  it("cascades delete when host is removed", () => {
    const { hosts, envVars } = setup();

    envVars.upsert({
      id: "e1",
      hostId: "h1",
      name: "TERM",
      value: "xterm-256color",
    });

    hosts.remove("h1");
    expect(envVars.listByHost("h1")).toHaveLength(0);
  });
});
