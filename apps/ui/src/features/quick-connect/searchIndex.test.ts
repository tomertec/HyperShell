import { describe, expect, it } from "vitest";

import { searchProfiles } from "./searchIndex";

describe("searchProfiles", () => {
  it("finds hosts by fuzzy name and metadata", () => {
    const results = searchProfiles(
      [
        {
          id: "h1",
          label: "db-prod",
          hostname: "db-01.example.com",
          transport: "ssh",
          group: "Production",
          tags: ["database", "prod"]
        },
        {
          id: "h2",
          label: "console-3",
          hostname: "COM3",
          transport: "serial",
          group: "Lab"
        }
      ],
      "dbp"
    );

    expect(results[0]?.id).toBe("h1");
  });

  it("returns all profiles for an empty search", () => {
    const profiles = [
      {
        id: "h1",
        label: "web",
        transport: "ssh" as const
      },
      {
        id: "h2",
        label: "serial",
        transport: "serial" as const
      }
    ];

    expect(searchProfiles(profiles, "   ")).toHaveLength(2);
  });
});
