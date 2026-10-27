"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/card";

/** Tag input with suggestions: Enter / comma / "Add" commits a tag; suggestions are one-click chips. */
export function AmenityInput({ id, value, onChange, suggestions = [], max = 60, placeholder = "Type an amenity and press Enter", disabled }: { id?: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; max?: number; placeholder?: string; disabled?: boolean }) {
  const [text, setText] = React.useState("");
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    const next = [...value];
    for (const t of tags) if (!next.some((v) => v.toLowerCase() === t.toLowerCase()) && next.length < max) next.push(t.slice(0, 60));
    onChange(next);
    setText("");
  };
  const remaining = suggestions.filter((s) => !has(s));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && text === "" && value.length > 0) onChange(value.slice(0, -1));
          }}
        />
        <Button type="button" variant="outline" disabled={disabled || text.trim() === ""} onClick={() => add(text)}>
          <Plus /> Add
        </Button>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {value.map((t) => (
            <li key={t}>
              <Badge tone="primary" className="gap-1.5 pr-1">
                {t}
                {!disabled ? (
                  <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} className="rounded-full p-0.5 hover:bg-primary/10" aria-label={`Remove ${t}`}>
                    <X className="size-3" />
                  </button>
                ) : null}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled && remaining.length > 0 && value.length < max ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Suggestions:</span>
          {remaining.slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
