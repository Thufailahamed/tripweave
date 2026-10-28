"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TRAVELER_BUDGET_CATEGORIES, TRAVELER_BUDGET_CATEGORY_LABELS, type TravelerBudgetCategory, type TravelerBudgetItem } from "@tripweave/shared";
import { Alert, Badge, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiDelete, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { tripKeys, useTrip } from "@/features/trips/hooks";
import { money } from "@/lib/utils";
import { travelKeys, useBudgetItems } from "./hooks";
import { budgetTotals } from "./lib";

export function TravelBudgetPanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const tripQuery = useTrip(id);
  const budgetQuery = useBudgetItems(id);
  const [label, setLabel] = React.useState("");
  const [category, setCategory] = React.useState<TravelerBudgetCategory>("other");
  const [amountMinor, setAmountMinor] = React.useState<number | null>(null);
  const [isPaid, setIsPaid] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TravelerBudgetItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [editCategory, setEditCategory] = React.useState<TravelerBudgetCategory>("other");
  const [editAmount, setEditAmount] = React.useState<number | null>(null);
  const [editPaid, setEditPaid] = React.useState(false);
  const [budgetInput, setBudgetInput] = React.useState<number | null>(null);
  const [savingBudget, setSavingBudget] = React.useState(false);

  const trip = tripQuery.data?.trip;
  const items = budgetQuery.data?.items ?? [];

  React.useEffect(() => {
    if (trip) setBudgetInput(trip.budgetAmountMinor);
  }, [trip?.id, trip?.budgetAmountMinor]);

  if (tripQuery.isLoading || budgetQuery.isLoading) return <LoadingBlock label="Loading the budget" />;
  if (!trip) return null;
  const totals = budgetTotals(items, trip.budgetCurrency, trip.budgetAmountMinor);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!label.trim()) return setError("Give the cost a name.");
    if (amountMinor === null) return setError("Enter an amount.");
    setAdding(true);
    try {
      await apiPost(`/traveler/trips/${id}/budget`, { label: label.trim(), category, amountMinor, isPaid });
      qc.invalidateQueries({ queryKey: travelKeys.budget(id) });
      setLabel("");
      setAmountMinor(null);
      setIsPaid(false);
      toast.success("Cost added");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: TravelerBudgetItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditCategory(item.category);
    setEditAmount(item.amountMinor);
    setEditPaid(item.isPaid);
  };

  const saveEdit = async (item: TravelerBudgetItem) => {
    if (!editLabel.trim()) return setError("Give the cost a name.");
    if (editAmount === null) return setError("Enter an amount.");
    try {
      await apiPatch(`/traveler/trips/${id}/budget/${item.id}`, { label: editLabel.trim(), category: editCategory, amountMinor: editAmount, isPaid: editPaid });
      qc.invalidateQueries({ queryKey: travelKeys.budget(id) });
      setEditingId(null);
      toast.success("Cost updated");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const togglePaid = async (item: TravelerBudgetItem) => {
    try {
      await apiPatch(`/traveler/trips/${id}/budget/${item.id}`, { isPaid: !item.isPaid });
      qc.invalidateQueries({ queryKey: travelKeys.budget(id) });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/traveler/trips/${id}/budget/${deleteTarget.id}`);
      qc.invalidateQueries({ queryKey: travelKeys.budget(id) });
      toast.success("Cost removed");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const saveBudget = async () => {
    setSavingBudget(true);
    try {
      await apiPatch(`/trips/${id}`, { budgetAmountMinor: budgetInput });
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      qc.invalidateQueries({ queryKey: travelKeys.trips });
      toast.success("Trip budget updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="tw-travel-eyebrow">Budget</p>
        <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">Keep the number honest.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Add what you expect to spend and tick things off as you pay. Stay options can add themselves from the Stays page.</p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {totals.mixedCurrency ? <Alert tone="warning" title="More than one currency">The totals below only add the trip currency ({trip.budgetCurrency}). Other currencies are kept on their own lines and are not converted silently.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="tw-travel-card p-5">
          <p className="tw-travel-eyebrow">Trip budget</p>
          <p className="tw-num mt-2 text-3xl font-semibold">{trip.budgetAmountMinor === null ? "Not set" : money(trip.budgetAmountMinor, trip.budgetCurrency)}</p>
          <div className="mt-3 flex items-end gap-2">
            <MoneyInput valueMinor={budgetInput} onMinorChange={setBudgetInput} currency={trip.budgetCurrency} id="trip-budget-amount" />
            <Button type="button" size="sm" variant="outline" loading={savingBudget} onClick={() => void saveBudget()}>Save</Button>
          </div>
        </div>
        <div className="tw-travel-card p-5"><p className="tw-travel-eyebrow">Planned</p><p className="tw-num mt-2 text-3xl font-semibold">{money(totals.totalMinor, trip.budgetCurrency)}</p><p className="mt-1 text-xs text-muted-foreground">{items.length} line{items.length === 1 ? "" : "s"}</p></div>
        <div className="tw-travel-card p-5"><p className="tw-travel-eyebrow">Paid</p><p className="tw-num mt-2 text-3xl font-semibold">{money(totals.paidMinor, trip.budgetCurrency)}</p><p className="mt-1 text-xs text-muted-foreground">{money(totals.unpaidMinor, trip.budgetCurrency)} still expected</p></div>
        <div className="tw-travel-card p-5">
          <p className="tw-travel-eyebrow">Remaining</p>
          <p className={`tw-num mt-2 text-3xl font-semibold ${totals.remainingMinor !== null && totals.remainingMinor < 0 ? "text-destructive" : ""}`}>{totals.remainingMinor === null ? "—" : money(totals.remainingMinor, trip.budgetCurrency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.remainingMinor === null ? "Set a trip budget to compare" : totals.remainingMinor < 0 ? "Over the trip budget" : "Left in the trip budget"}</p>
        </div>
      </div>

      <form onSubmit={add} className="tw-travel-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto] lg:items-end">
        <Field label="What is it?" htmlFor="budget-label"><Input id="budget-label" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Train to Kandy" /></Field>
        <Field label="Category" htmlFor="budget-category"><Select id="budget-category" value={category} onChange={(event) => setCategory(event.target.value as TravelerBudgetCategory)}>{TRAVELER_BUDGET_CATEGORIES.map((value) => <option key={value} value={value}>{TRAVELER_BUDGET_CATEGORY_LABELS[value]}</option>)}</Select></Field>
        <Field label="Amount" htmlFor="budget-amount"><MoneyInput id="budget-amount" valueMinor={amountMinor} onMinorChange={setAmountMinor} currency={trip.budgetCurrency} /></Field>
        <div className="flex items-center gap-3 pb-1">
          <Checkbox id="budget-paid" label="Paid" checked={isPaid} onChange={(event) => setIsPaid(event.target.checked)} />
          <Button type="submit" loading={adding}><Plus className="size-4" /> Add</Button>
        </div>
      </form>

      <section className="tw-travel-card overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><Wallet className="size-4" /></span>
            <p className="text-sm font-semibold">No costs yet.</p>
            <p className="max-w-md text-sm text-muted-foreground">Start with transport or the first night. Stays can be added from the Stays page.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {editingId === item.id ? (
                  <div className="grid w-full gap-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto] sm:items-end">
                    <Field label="Cost" htmlFor={`edit-budget-label-${item.id}`}><Input id={`edit-budget-label-${item.id}`} value={editLabel} maxLength={120} onChange={(event) => setEditLabel(event.target.value)} /></Field>
                    <Field label="Category" htmlFor={`edit-budget-category-${item.id}`}><Select id={`edit-budget-category-${item.id}`} value={editCategory} onChange={(event) => setEditCategory(event.target.value as TravelerBudgetCategory)}>{TRAVELER_BUDGET_CATEGORIES.map((value) => <option key={value} value={value}>{TRAVELER_BUDGET_CATEGORY_LABELS[value]}</option>)}</Select></Field>
                    <Field label="Amount" htmlFor={`edit-budget-amount-${item.id}`}><MoneyInput id={`edit-budget-amount-${item.id}`} valueMinor={editAmount} onMinorChange={setEditAmount} currency={trip.budgetCurrency} /></Field>
                    <div className="flex items-center gap-2 pb-1">
                      <Checkbox id={`edit-budget-paid-${item.id}`} label="Paid" checked={editPaid} onChange={(event) => setEditPaid(event.target.checked)} />
                      <Button type="button" size="sm" onClick={() => void saveEdit(item)}>Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Checkbox aria-label={`Mark ${item.label} paid`} checked={item.isPaid} onChange={() => void togglePaid(item)} />
                    <div className="min-w-0 flex-1">
                      <p className={item.isPaid ? "truncate text-sm font-semibold text-muted-foreground line-through" : "truncate text-sm font-semibold"}>{item.label}</p>
                      <p className="text-[11px] text-muted-foreground">{TRAVELER_BUDGET_CATEGORY_LABELS[item.category]}</p>
                    </div>
                    <Badge tone={item.isPaid ? "success" : "neutral"}>{item.isPaid ? "Paid" : "Planned"}</Badge>
                    <span className="tw-num w-24 text-right text-sm font-semibold">{money(item.amountMinor, item.currency)}</span>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${item.label}`} onClick={() => startEdit(item)}><Pencil className="size-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${item.label}`} onClick={() => setDeleteTarget(item)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Remove this cost?" description={deleteTarget ? `“${deleteTarget.label}” will be removed from the budget.` : ""} confirmLabel="Remove" destructive loading={deleting} onConfirm={() => void remove()} />
    </div>
  );
}
