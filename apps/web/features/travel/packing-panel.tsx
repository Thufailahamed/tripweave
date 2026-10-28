"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Backpack, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TRAVELER_PACKING_CATEGORIES, TRAVELER_PACKING_CATEGORY_LABELS, type TravelerPackingCategory } from "@tripweave/shared";
import { Alert, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { apiDelete, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { travelKeys, usePackingItems } from "./hooks";
import { packingProgress } from "./lib";

export function TravelPackingPanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const packingQuery = usePackingItems(id);
  const [label, setLabel] = React.useState("");
  const [category, setCategory] = React.useState<TravelerPackingCategory>("other");
  const [adding, setAdding] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (packingQuery.isLoading) return <LoadingBlock label="Loading the packing list" />;
  const items = packingQuery.data?.items ?? [];
  const progress = packingProgress(items);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!label.trim()) return setError("Give the item a name.");
    setAdding(true);
    try {
      await apiPost(`/traveler/trips/${id}/packing`, { label: label.trim(), category });
      qc.invalidateQueries({ queryKey: travelKeys.packing(id) });
      setLabel("");
      toast.success("Added to the list");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (itemId: string, checked: boolean) => {
    try {
      await apiPatch(`/traveler/trips/${id}/packing/${itemId}`, { isChecked: checked });
      qc.invalidateQueries({ queryKey: travelKeys.packing(id) });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (itemId: string) => {
    try {
      await apiDelete(`/traveler/trips/${id}/packing/${itemId}`);
      qc.invalidateQueries({ queryKey: travelKeys.packing(id) });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await apiPost<{ added: number }>(`/traveler/trips/${id}/packing/generate`, {});
      qc.invalidateQueries({ queryKey: travelKeys.packing(id) });
      toast.success(result.added === 0 ? "Everything from the suggestion is already on the list" : `Added ${result.added} item${result.added === 1 ? "" : "s"}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const grouped = TRAVELER_PACKING_CATEGORIES.map((cat) => ({ category: cat, items: items.filter((item) => item.category === cat) })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tw-travel-eyebrow">Packing</p>
          <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">The bag, in one place.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">A list built from your route and activities. It makes no weather claims; add what you know about the season.</p>
        </div>
        <Button variant="outline" onClick={() => void generate()} loading={generating}><Sparkles className="size-4" /> Generate suggestions</Button>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="tw-travel-card flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Backpack className="size-4 text-accent" /> {progress.checked} of {progress.total} packed</p>
          <span className="tw-num text-muted-foreground">{progress.percent}%</span>
        </div>
        <div role="progressbar" aria-label="Packing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="sr-only" aria-live="polite">{progress.checked} of {progress.total} items checked.</p>
      </div>

      <form onSubmit={add} className="tw-travel-card grid gap-4 p-5 sm:grid-cols-[1.4fr_0.8fr_auto] sm:items-end">
        <Field label="Add an item" htmlFor="packing-label"><Input id="packing-label" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Walking shoes" /></Field>
        <Field label="Category" htmlFor="packing-category"><Select id="packing-category" value={category} onChange={(event) => setCategory(event.target.value as TravelerPackingCategory)}>{TRAVELER_PACKING_CATEGORIES.map((value) => <option key={value} value={value}>{TRAVELER_PACKING_CATEGORY_LABELS[value]}</option>)}</Select></Field>
        <Button type="submit" loading={adding}><Plus className="size-4" /> Add</Button>
      </form>

      {items.length === 0 ? (
        <section className="tw-travel-card flex flex-col items-start gap-3 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><Backpack className="size-4" /></span>
          <p className="text-sm font-semibold">Nothing packed yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">Generate a list from the route, or add the first thing you know you will need.</p>
          <Button variant="outline" onClick={() => void generate()} loading={generating}><Sparkles className="size-4" /> Generate suggestions</Button>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grouped.map((group) => (
            <section key={group.category} className="tw-travel-card p-4">
              <h3 className="tw-travel-eyebrow">{TRAVELER_PACKING_CATEGORY_LABELS[group.category]}</h3>
              <ul className="mt-3 flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/50">
                    <Checkbox checked={item.isChecked} onChange={(event) => void toggle(item.id, event.target.checked)} label={item.label} />
                    <button type="button" aria-label={`Remove ${item.label}`} onClick={() => void remove(item.id)} className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
