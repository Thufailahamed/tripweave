"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Free-text chips: Enter or comma adds, Backspace on empty input removes the last, click x removes one. */
export function TagInput({ id, label, value, onChange, placeholder, suggestions, maxLength = 60 }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[]; maxLength?: number }) {
  const [text, setText] = React.useState("");
  const listId = `${id}-list`;
  const add = (raw: string) => {
    const t = raw.trim().slice(0, maxLength);
    if (!t) return;
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:outline-2 focus-within:outline-ring">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full hover:bg-primary/10">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-label={label}
          list={suggestions ? listId : undefined}
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          className={cn("min-w-[8ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70")}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
        />
      </div>
      {suggestions ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
