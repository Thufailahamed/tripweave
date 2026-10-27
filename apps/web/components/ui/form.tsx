"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-lg border border-input bg-background/40 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-[border-color,box-shadow,background-color] hover:border-foreground/25 focus-visible:border-accent/70 focus-visible:bg-background/70 focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_14%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-[invalid=true]:border-destructive";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** Native select: fully accessible, keyboard-friendly and reliable on mobile. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239aa5a8%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />
));
Label.displayName = "Label";

/** Label + control + hint/error, wired for accessibility. */
export function Field({ label, htmlFor, error, hint, required, children, className }: { label: string; htmlFor?: string; error?: string | null; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string }>(({ className, label, id, ...props }, ref) => {
  const autoId = React.useId();
  const cid = id ?? autoId;
  return (
    <label htmlFor={cid} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input ref={ref} id={cid} type="checkbox" className={cn("size-4 rounded border-input accent-[var(--accent)]", className)} {...props} />
      {label}
    </label>
  );
});
Checkbox.displayName = "Checkbox";

export function Switch({ checked, onCheckedChange, label, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; disabled?: boolean; id?: string }) {
  const autoId = React.useId();
  const sid = id ?? autoId;
  return (
    <div className="inline-flex items-center gap-2">
      <SwitchPrimitive.Root id={sid} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="relative h-5 w-9 shrink-0 rounded-full bg-input transition-colors data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
        <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label ? (
        <label htmlFor={sid} className="cursor-pointer text-sm">
          {label}
        </label>
      ) : null}
    </div>
  );
}

/** Money input in major units ("1,250.50"); reports integer minor units via onMinorChange (null when invalid/blank). */
export function MoneyInput({ valueMinor, onMinorChange, currency, id, invalid, placeholder }: { valueMinor: number | null; onMinorChange: (v: number | null) => void; currency: string; id?: string; invalid?: boolean; placeholder?: string }) {
  const [text, setText] = React.useState(valueMinor === null ? "" : (valueMinor / 100).toFixed(2));
  const last = React.useRef(valueMinor);
  React.useEffect(() => {
    if (valueMinor !== last.current) {
      last.current = valueMinor;
      setText(valueMinor === null ? "" : (valueMinor / 100).toFixed(2));
    }
  }, [valueMinor]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{currency}</span>
      <Input
        id={id}
        inputMode="decimal"
        aria-invalid={invalid}
        placeholder={placeholder ?? "0.00"}
        className="tw-num pl-12 text-right"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const s = v.replace(/,/g, "").trim();
          const parsed = /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : null;
          last.current = parsed;
          onMinorChange(s === "" ? null : parsed);
        }}
      />
    </div>
  );
}
