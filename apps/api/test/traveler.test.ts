import { describe, expect, it } from "vitest";
import { Harness } from "./harness";

describe("traveller workspaces", () => {
  it("creates a personal workspace with a restricted role and an individual session", async () => {
    const h = new Harness();
    const c = await h.registerTraveler("Maya");
    const me = await c.ok<{ organization: { accountKind: string; role: string }; permissions: string[] }>("GET", "/auth/me");
    expect(me.organization.accountKind).toBe("individual");
    expect(me.organization.role).toBe("staff");
    expect(me.permissions).not.toContain("margins:view");
    const trips = await c.ok<unknown[]>("GET", "/trips");
    expect(trips).toEqual([]);
  });
});
