"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { roomTypeSchema } from "@tripweave/shared";
import { Alert, Badge, Card, EmptyState, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlay";
import { apiDelete, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { AmenityInput } from "./amenity-input";
import { AMENITY_SUGGESTIONS, BED_SUGGESTIONS, apiFieldErrors, issuesToErrors } from "./lib";
import type { RoomType } from "./types";

interface RoomValues {
  name: string;
  description: string;
  bedConfiguration: string[];
  maximumAdults: string;
  maximumChildren: string;
  maximumOccupancy: string;
  amenities: string[];
  status: string;
}

function RoomForm({ propertyId, room, onDone }: { propertyId: string; room?: RoomType; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState<RoomValues>({
    name: room?.name ?? "",
    description: room?.description ?? "",
    bedConfiguration: room?.bedConfiguration ?? [],
    maximumAdults: String(room?.maximumAdults ?? 2),
    maximumChildren: String(room?.maximumChildren ?? 0),
    maximumOccupancy: String(room?.maximumOccupancy ?? 2),
    amenities: room?.amenities ?? [],
    status: room?.status ?? "active",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const set = <K extends keyof RoomValues>(k: K, val: RoomValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const payload = {
        name: v.name.trim(),
        description: v.description,
        bedConfiguration: v.bedConfiguration,
        maximumAdults: Number(v.maximumAdults),
        maximumChildren: Number(v.maximumChildren),
        maximumOccupancy: Number(v.maximumOccupancy),
        amenities: v.amenities,
        status: v.status,
      };
      const parsed = roomTypeSchema.safeParse(payload);
      const errs = parsed.success ? {} : issuesToErrors(parsed.error);
      if (parsed.success && payload.maximumOccupancy < payload.maximumAdults) errs.maximumOccupancy = "Maximum occupancy must be at least the maximum adults";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return room ? apiPatch(`/hotels/${propertyId}/rooms/${room.id}`, payload) : apiPost(`/hotels/${propertyId}/rooms`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
      toast.success(room ? "Room type updated" : "Room type added");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field label="Room type name" htmlFor="r-name" error={errors.name} required>
        <Input id="r-name" value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Description" htmlFor="r-desc" error={errors.description}>
        <Textarea id="r-desc" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max adults" htmlFor="r-adults" error={errors.maximumAdults} required>
          <Input id="r-adults" type="number" min={1} max={12} value={v.maximumAdults} onChange={(e) => set("maximumAdults", e.target.value)} aria-invalid={!!errors.maximumAdults} />
        </Field>
        <Field label="Max children" htmlFor="r-children" error={errors.maximumChildren}>
          <Input id="r-children" type="number" min={0} max={8} value={v.maximumChildren} onChange={(e) => set("maximumChildren", e.target.value)} aria-invalid={!!errors.maximumChildren} />
        </Field>
        <Field label="Max occupancy" htmlFor="r-occ" error={errors.maximumOccupancy} hint="Total guests; at least the max adults." required>
          <Input id="r-occ" type="number" min={1} max={14} value={v.maximumOccupancy} onChange={(e) => set("maximumOccupancy", e.target.value)} aria-invalid={!!errors.maximumOccupancy} />
        </Field>
      </div>
      <Field label="Bed configuration" htmlFor="r-beds" error={errors.bedConfiguration}>
        <AmenityInput id="r-beds" value={v.bedConfiguration} onChange={(a) => set("bedConfiguration", a)} suggestions={BED_SUGGESTIONS} max={6} placeholder="e.g. 1 king bed" />
      </Field>
      <Field label="Room amenities" htmlFor="r-amen" error={errors.amenities}>
        <AmenityInput id="r-amen" value={v.amenities} onChange={(a) => set("amenities", a)} suggestions={AMENITY_SUGGESTIONS} max={40} />
      </Field>
      <Field label="Status" htmlFor="r-status">
        <Select id="r-status" value={v.status} onChange={(e) => set("status", e.target.value)} className="max-w-48">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {room ? "Save room type" : "Add room type"}
        </Button>
      </div>
    </form>
  );
}

export function RoomsTab({ propertyId, rooms, canEdit }: { propertyId: string; rooms: RoomType[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<RoomType | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<RoomType | null>(null);
  const del = useMutation({
    mutationFn: (r: RoomType) => apiDelete(`/hotels/${propertyId}/rooms/${r.id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
      toast.success("Room type deleted");
      setDeleting(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(null);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add room type
          </Button>
        </div>
      ) : null}
      {rooms.length === 0 ? (
        <EmptyState icon={BedDouble} title="No room types yet" description="Rates and inventory are attached to room types, so add at least one." action={canEdit ? <Button onClick={() => setEditing("new")}>Add room type</Button> : undefined} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-semibold">{r.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden /> Up to {r.maximumAdults} adult{r.maximumAdults === 1 ? "" : "s"}, {r.maximumChildren} child{r.maximumChildren === 1 ? "" : "ren"}, {r.maximumOccupancy} guests in total
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.description ? <p className="text-sm text-muted-foreground">{r.description}</p> : null}
                {r.bedConfiguration.length > 0 ? <p className="text-sm">Beds: {r.bedConfiguration.join(", ")}</p> : null}
                {r.amenities.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {r.amenities.map((a) => (
                      <li key={a}>
                        <Badge tone="outline">{a}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canEdit ? (
                  <div className="mt-auto flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Pencil /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null ? (
          <DialogContent title={editing === "new" ? "Add room type" : `Edit ${editing.name}`} description="Occupancy limits are used when matching rooms to travelling parties." wide>
            <RoomForm propertyId={propertyId} room={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete room type?"
        description={`"${deleting?.name ?? ""}" will be removed. This fails if rate plans still use it.`}
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </div>
  );
}
