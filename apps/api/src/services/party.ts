import type { RoomAllocation } from "@tripweave/shared";

/** Target two adults per room, with extra rooms when the party exceeds three guests per room. */
export function defaultRoomCount(adults: number, children: number): number {
  return Math.max(1, Math.ceil(adults / 2), Math.ceil((adults + children) / 3));
}

/**
 * Allocates a party across rooms. Every room gets an adult; empty rooms collapse. The returned
 * assumption is shown to the user when the room count was inferred rather than stated.
 */
export function allocateRooms(adults: number, children: number, childAges: number[], roomCount: number | null): { rooms: RoomAllocation[]; assumption: string | null } {
  const n = Math.max(1, roomCount ?? defaultRoomCount(adults, children));
  const rooms: RoomAllocation[] = Array.from({ length: n }, () => ({ adults: 0, children: 0, childAges: [] as number[] }));
  for (let i = 0; i < adults; i++) rooms[i % n]!.adults++;
  // Every room needs an adult; collapse empty rooms when there are more rooms than adults.
  const filled = rooms.filter((r) => r.adults > 0);
  for (let i = 0; i < children; i++) {
    const r = filled[i % filled.length]!;
    r.children++;
    if (childAges[i] !== undefined) r.childAges!.push(childAges[i]!);
  }
  const out = filled.map((r) => ({ adults: r.adults, children: r.children, ...(r.childAges!.length ? { childAges: r.childAges } : {}) }));
  return { rooms: out, assumption: roomCount === null ? `Assumed ${out.length} room${out.length === 1 ? "" : "s"} for ${adults} adult${adults === 1 ? "" : "s"}${children ? ` and ${children} child${children === 1 ? "" : "ren"}` : ""}; edit the room allocation if needed.` : null };
}
