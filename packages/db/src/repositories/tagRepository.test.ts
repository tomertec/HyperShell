import { describe, expect, it } from "vitest";
import { openDatabase } from "../index";
import { createHostsRepositoryFromDatabase } from "./hostsRepository";
import { createTagRepositoryFromDatabase } from "./tagRepository";

describe("tagRepository", () => {
  function setup() {
    const db = openDatabase(":memory:");
    const hosts = createHostsRepositoryFromDatabase(db);
    const tags = createTagRepositoryFromDatabase(db);

    hosts.create({ id: "h1", name: "web-01", hostname: "web-01.example.com" });
    hosts.create({ id: "h2", name: "db-01", hostname: "db-01.example.com" });

    return { hosts, tags };
  }

  it("upserts and lists tags in name order", () => {
    const { tags } = setup();

    tags.upsert({ id: "t2", name: "prod", color: "#ef4444" });
    tags.upsert({ id: "t1", name: "app", color: "#22c55e" });

    const listed = tags.list();
    expect(listed).toHaveLength(2);
    expect(listed.map((tag) => tag.name)).toEqual(["app", "prod"]);
    expect(listed[0]?.color).toBe("#22c55e");
  });

  it("associates tags to a host and replaces associations", () => {
    const { tags } = setup();
    tags.upsert({ id: "t1", name: "prod", color: "#ef4444" });
    tags.upsert({ id: "t2", name: "db", color: "#3b82f6" });
    tags.upsert({ id: "t3", name: "linux", color: "#14b8a6" });

    const first = tags.setHostTags("h1", ["t1", "t2"]);
    expect(first.map((tag) => tag.id)).toEqual(["t2", "t1"]);

    const second = tags.setHostTags("h1", ["t3"]);
    expect(second.map((tag) => tag.id)).toEqual(["t3"]);
    expect(tags.getHostTags("h1").map((tag) => tag.id)).toEqual(["t3"]);
  });

  it("cascades host_tags rows when tag is removed", () => {
    const { tags } = setup();
    tags.upsert({ id: "t1", name: "prod", color: "#ef4444" });
    tags.setHostTags("h1", ["t1"]);

    expect(tags.getHostTags("h1")).toHaveLength(1);
    tags.remove("t1");
    expect(tags.getHostTags("h1")).toHaveLength(0);
  });

  it("cascades host_tags rows when host is removed", () => {
    const { hosts, tags } = setup();
    tags.upsert({ id: "t1", name: "prod", color: "#ef4444" });
    tags.setHostTags("h1", ["t1"]);

    hosts.remove("h1");
    expect(tags.getHostTags("h1")).toHaveLength(0);
  });
});
