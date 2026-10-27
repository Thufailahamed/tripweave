"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { Alert, Card, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { apiGet, apiPut, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { addDaysIso, todayIso } from "./lib";
import type { RoomType } from "./types";

interface InvRow {
  date: string;
  availableQuantity: number | null;
}

const DAY_OPTIONS = [14, 28, 56, 90];

export function InventoryTab({ propertyId, rooms, canEdit }: { propertyId: string; rooms: RoomType[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = React.useState(rooms[0]?.id ?? "");
  const [from, setFrom] = React.useState(todayIso());
  const [days, setDays] = React.useState(28);
  /** Pending edits keyed by date. "" = unknown (null), digits = quantity. Absent key = untouched. */
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [bulk, setBulk] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!roomId && rooms[0]) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(from);
  const to = validFrom ? addDaysIso(from, days - 1) : from;
  const dates = React.useMemo(() => (validFrom ? Array.from({ length: days }, (_, i) => addDaysIso(from, i)) : []), [from, days, validFrom]);
  const key = ["hotel", propertyId, "inventory", roomId, from, days];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<InvRow[]>(`/hotels/${propertyId}/rooms/${roomId}/inventory`, { from, to }), enabled: !!roomId && validFrom });
  const stored = React.useMemo(() => new Map((q.data ?? []).map((r) => [r.date, r.availableQuantity])), [q.data]);

  // Pending edits belong to one room/range.
  React.useEffect(() => setEdits({}), [roomId, from, days]);

  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(edits).map(([date, text]) => ({ date, availableQuantity: text === "" ? null : Number(text) }));
      return apiPut<{ updated: number }>(`/hotels/${propertyId}/inventory`, { roomTypeId: roomId, entries });
    },
    onSuccess: async (r) => {
      toast.success(`${r.updated} date${r.updated === 1 ? "" : "s"} updated`);
      setEdits({});
      setError(null);
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId, "inventory"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const setCell = (date: string, text: string) => {
    if (text !== "" && !/^\d{1,5}$/.test(text)) return;
    const original = stored.get(date);
    const originalText = original === null || original === undefined ? "" : String(original);
    setEdits((s) => {
      const next = { ...s };
      if (text === originalText) delete next[date];
      else next[date] = text;
      return next;
    });
  };
  const applyBulk = (text: string) => {
    if (text !== "" && !/^\d{1,5}$/.test(text)) return setError("Enter a whole number of rooms.");
    setError(null);
    const next: Record<string, string> = {};
    for (const d of dates) {
      const original = stored.get(d);
      const originalText = original === null || original === undefined ? "" : String(original);
      if (text !== originalText) next[d] = text;
    }
    setEdits(next);
  };
  const pending = Object.keys(edits).length;

  if (rooms.length === 0) return <EmptyState icon={CalendarDays} title="No room types" description="Add a room type before managing inventory." />;
  const room = rooms.find((r) => r.id === roomId);

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="Unknown is not the same as sold out">
        A blank date means availability is <strong>unknown</strong>: it will not be offered as confirmed. A value of <strong>0</strong> means the room is <strong>sold out</strong>.
      </Alert>
      <Card className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Room type" htmlFor="inv-room">
          <Select id="inv-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" htmlFor="inv-from" error={validFrom ? undefined : "Enter a valid date"}>
          <Input id="inv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Range" htmlFor="inv-days">
          <Select id="inv-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {canEdit ? (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Set every date in range to" htmlFor="inv-bulk" hint="Blank = unknown">
            <Input id="inv-bulk" inputMode="numeric" placeholder="rooms" value={bulk} onChange={(e) => setBulk(e.target.value)} className="w-28" />
          </Field>
          <Button variant="outline" onClick={() => applyBulk(bulk.trim())}>
            Apply to range
          </Button>
          <Button variant="outline" onClick={() => { setBulk("0"); applyBulk("0"); }}>
            Mark all sold out (0)
          </Button>
          <Button variant="outline" onClick={() => { setBulk(""); applyBulk(""); }}>
            Mark all unknown
          </Button>
        </Card>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {q.isLoading ? (
        <LoadingBlock label="Loading inventory" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load inventory" />
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold">{room?.name}</span>
            <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm border border-dashed border-border bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--muted)_3px,var(--muted)_6px)]" aria-hidden /> Unknown</span>
            <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-destructive-soft ring-1 ring-destructive/40" aria-hidden /> Sold out (0)</span>
            <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-success-soft ring-1 ring-success/40" aria-hidden /> Rooms available</span>
            {canEdit ? <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm ring-2 ring-accent" aria-hidden /> Unsaved change</span> : null}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {dates.map((d) => {
              const original = stored.get(d);
              const editedText = edits[d];
              const text = editedText !== undefined ? editedText : original === null || original === undefined ? "" : String(original);
              const unknown = text === "";
              const soldOut = text === "0";
              const dt = new Date(`${d}T00:00:00Z`);
              return (
                <li
                  key={d}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border p-2 text-center",
                    unknown && "border-dashed border-border bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--muted)_4px,var(--muted)_8px)]",
                    soldOut && "border-destructive/40 bg-destructive-soft",
                    !unknown && !soldOut && "border-success/40 bg-success-soft",
                    editedText !== undefined && "ring-2 ring-accent",
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(dt)}</span>
                  <span className="tw-num text-xs font-semibold">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt)}</span>
                  {canEdit ? (
                    <Input aria-label={`Rooms available on ${d} (blank means unknown)`} inputMode="numeric" placeholder="?" value={text} onChange={(e) => setCell(d, e.target.value.trim())} className="tw-num h-8 px-1 text-center" />
                  ) : (
                    <span className="tw-num text-sm font-bold">{unknown ? "?" : text}</span>
                  )}
                  <span className="text-[11px] font-semibold">{unknown ? "Unknown" : soldOut ? "Sold out" : "Available"}</span>
                </li>
              );
            })}
          </ul>
          {canEdit ? (
            <div className="mt-4 flex items-center justify-end gap-3">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {pending === 0 ? "No unsaved changes" : `${pending} unsaved change${pending === 1 ? "" : "s"}`}
              </span>
              <Button variant="outline" disabled={pending === 0} onClick={() => setEdits({})}>
                Discard
              </Button>
              <Button loading={save.isPending} disabled={pending === 0} onClick={() => save.mutate()}>
                Save inventory
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
