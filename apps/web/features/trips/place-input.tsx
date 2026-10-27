"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/form";
import { apiGet } from "@/lib/api";
import { useDebouncedValue } from "./hooks";

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

/** Destination field with autocomplete from the places gazetteer (GET /places/search). Free text is still allowed. */
export function PlaceInput({ id, value, onTextChange, onPick, invalid }: { id: string; value: string; onTextChange: (text: string) => void; onPick: (p: Place) => void; invalid?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const debounced = useDebouncedValue(value.trim(), 200);
  const q = useQuery({ queryKey: ["places", debounced], queryFn: () => apiGet<Place[]>("/places/search", { q: debounced }), enabled: open && debounced.length >= 1, staleTime: 5 * 60_000 });
  const items = q.data ?? [];
  const listId = `${id}-places`;

  const pick = (p: Place) => {
    onPick(p);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        maxLength={80}
        value={value}
        placeholder="Start typing a place, e.g. Kandy"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && items.length > 0 ? (
        <ul id={listId} role="listbox" aria-label="Matching places" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg">
          {items.map((p, i) => (
            <li
              key={`${p.name}-${p.latitude}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer justify-between gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-primary-soft" : "hover:bg-muted"}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.country}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
