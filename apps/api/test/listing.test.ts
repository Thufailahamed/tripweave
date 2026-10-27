import { describe, expect, it } from "vitest";
import { Harness } from "./harness";

describe("customer listing", () => {
  it("keeps the A-Z default and supports explicit sort columns and directions", async () => {
    const h = new Harness();
    const c = await h.register("Sort Co", "tour_operator");
    for (const [name, email] of [["Charlie", "a@x.example"], ["alice", "c@x.example"], ["Bob", "b@x.example"]] as const) {
      await c.ok("POST", "/customers", { name, email });
      h.now = new Date(h.now.getTime() + 1000); // distinct created_at values
    }
    const names = async (qs = "") => (await c.get(`/customers${qs}`)).body.data.map((x: { name: string }) => x.name);
    expect(await names()).toEqual(["alice", "Bob", "Charlie"]); // default is unchanged by the new option
    expect(await names("?sort=name&order=desc")).toEqual(["Charlie", "Bob", "alice"]);
    expect(await names("?sort=email&order=asc")).toEqual(["Charlie", "Bob", "alice"]); // a@, b@, c@
    expect(await names("?sort=created&order=asc")).toEqual(["Charlie", "alice", "Bob"]);
    expect(await names("?sort=created&order=desc")).toEqual(["Bob", "alice", "Charlie"]);
    expect(await names("?sort=notacolumn; DROP TABLE customers")).toEqual(["alice", "Bob", "Charlie"]); // unknown column falls back, never reaches SQL
    expect((await c.get("/customers")).body.data).toHaveLength(3);
  });
});

describe("import and export beyond one page of properties", () => {
  it("exports every owned property, not just the first 100", async () => {
    const h = new Harness();
    const c = await h.register("Big Portfolio", "hotel_management");
    for (let i = 0; i < 105; i++) await c.ok("POST", "/hotels", { name: `Hotel ${String(i).padStart(3, "0")}`, city: "Galle", category: "comfort" });
    const exported = await c.get("/exports/hotels.csv");
    expect(exported.status).toBe(200);
    const lines = exported.text.trim().split("\n");
    expect(lines).toHaveLength(106); // header + 105
    expect(exported.text).toContain("Hotel 104,");
  });

  it("resolves properties past the first page when importing rates", async () => {
    const h = new Harness();
    const c = await h.register("Big Portfolio", "hotel_management");
    let last = "";
    for (let i = 0; i < 101; i++) {
      const hotel = await c.ok("POST", "/hotels", { name: `Hotel ${String(i).padStart(3, "0")}`, city: "Galle", category: "comfort" });
      last = hotel.id;
    }
    await c.ok("POST", `/hotels/${last}/rooms`, { name: "Sea View", maximumAdults: 2, maximumOccupancy: 3 });
    const csv = "property,roomType,ratePlan,mealPlan,currency,startDate,endDate,amount\nHotel 100,Sea View,Net,BB,USD,2026-02-01,2026-02-28,130.50";
    const dry = await c.ok("POST", "/imports/rates", { csv });
    expect(dry).toMatchObject({ validRows: 1, errors: [] }); // "Hotel 100" is the 101st property by name
  });
});
