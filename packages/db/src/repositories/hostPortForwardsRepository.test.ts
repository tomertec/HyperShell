import { describe, expect, it } from "vitest";
import { openDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createHostPortForwardsRepositoryFromDatabase } from "./hostPortForwardsRepository";

describe("hostPortForwardsRepository", () => {
  function setup() {
    const db = openDatabase(":memory:");
    const hosts = createHostsRepositoryFromDatabase(db);
    const forwards = createHostPortForwardsRepositoryFromDatabase(db);
    hosts.create({ id: "h1", name: "web", hostname: "web.example.com" });
    return { db, hosts, forwards };
  }

  it("creates and lists port forwards for a host", () => {
    const { forwards } = setup();
    const fwd = forwards.create({
      id: "pf1",
      hostId: "h1",
      name: "DB tunnel",
      protocol: "local",
      localPort: 5432,
      remoteHost: "db.internal",
      remotePort: 5432,
      autoStart: true,
    });

    expect(fwd.name).toBe("DB tunnel");
    expect(fwd.protocol).toBe("local");
    expect(fwd.localPort).toBe(5432);
    expect(fwd.remoteHost).toBe("db.internal");
    expect(fwd.autoStart).toBe(true);
    expect(forwards.listForHost("h1")).toHaveLength(1);
  });

  it("returns empty list for host with no forwards", () => {
    const { forwards } = setup();
    expect(forwards.listForHost("h1")).toHaveLength(0);
  });

  it("updates a port forward via upsert", () => {
    const { forwards } = setup();
    forwards.create({ id: "pf1", hostId: "h1", name: "old", protocol: "local", localPort: 8080, remoteHost: "localhost", remotePort: 80 });
    const updated = forwards.update({ id: "pf1", hostId: "h1", name: "new", protocol: "dynamic", localPort: 1080 });

    expect(updated.name).toBe("new");
    expect(updated.protocol).toBe("dynamic");
    expect(updated.localPort).toBe(1080);
  });

  it("removes a port forward", () => {
    const { forwards } = setup();
    forwards.create({ id: "pf1", hostId: "h1", name: "tunnel", protocol: "local", localPort: 8080, remoteHost: "localhost", remotePort: 80 });
    expect(forwards.remove("pf1")).toBe(true);
    expect(forwards.listForHost("h1")).toHaveLength(0);
  });

  it("cascades delete when host is removed", () => {
    const { hosts, forwards } = setup();
    forwards.create({ id: "pf1", hostId: "h1", name: "tunnel", protocol: "local", localPort: 8080, remoteHost: "localhost", remotePort: 80 });
    hosts.remove("h1");
    expect(forwards.listForHost("h1")).toHaveLength(0);
  });

  it("defaults localAddress, remoteHost, remotePort", () => {
    const { forwards } = setup();
    const fwd = forwards.create({ id: "pf1", hostId: "h1", name: "socks", protocol: "dynamic", localPort: 1080 });

    expect(fwd.localAddress).toBe("127.0.0.1");
    expect(fwd.remoteHost).toBe("");
    expect(fwd.remotePort).toBe(0);
    expect(fwd.autoStart).toBe(false);
  });
});
