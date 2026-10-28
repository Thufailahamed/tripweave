import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("planning library construction", () => {
  it("does not call crypto while the module is imported", async () => {
    vi.resetModules();
    const spy = vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("crypto is not allowed in global scope");
    });
    try {
      const mod = await import("./library");
      expect(typeof mod.getPlanningLibrarySpec).toBe("function");
      expect(() => mod.getPlanningLibrarySpec()).toThrow(/global scope/);
    } finally {
      spy.mockRestore();
    }
  });
});
