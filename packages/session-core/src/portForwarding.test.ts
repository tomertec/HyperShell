import { describe, expect, it } from "vitest";
import { buildForwardArg } from "./portForwarding";

describe("buildForwardArg", () => {
  it("builds local forward args", () => {
    const args = buildForwardArg({
      protocol: "local",
      localAddress: "127.0.0.1",
      localPort: 8080,
      remoteHost: "db.internal",
      remotePort: 5432
    });
    expect(args).toEqual(["-L", "127.0.0.1:8080:db.internal:5432"]);
  });

  it("builds remote forward args", () => {
    const args = buildForwardArg({
      protocol: "remote",
      localAddress: "0.0.0.0",
      localPort: 3000,
      remoteHost: "localhost",
      remotePort: 3000
    });
    expect(args).toEqual(["-R", "0.0.0.0:3000:localhost:3000"]);
  });

  it("builds dynamic forward args", () => {
    const args = buildForwardArg({
      protocol: "dynamic",
      localAddress: "127.0.0.1",
      localPort: 1080,
      remoteHost: "",
      remotePort: 0
    });
    expect(args).toEqual(["-D", "127.0.0.1:1080"]);
  });
});
