"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { ApiError, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { customerKeys, type Customer } from "./types";

type FormValues = z.input<typeof customerSchema>;

const EMPTY: FormValues = { name: "", email: "", phone: "", country: "", preferredLanguage: "", notes: "" };

function toValues(c: Customer | null | undefined): FormValues {
  return c ? { name: c.name, email: c.email ?? "", phone: c.phone ?? "", country: c.country ?? "", preferredLanguage: c.preferredLanguage ?? "", notes: c.notes ?? "" } : EMPTY;
}

/** Create or edit a customer. Used by the customers pages and the quick-create flow on the trip form. */
export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (c: Customer) => void }) {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<FormValues>({ resolver: zodResolver(customerSchema) as never, defaultValues: toValues(customer) });

  React.useEffect(() => {
    if (open) {
      reset(toValues(customer));
      setError(null);
    }
  }, [open, customer, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = { ...v, country: v.country ? v.country.toUpperCase() : v.country };
      return customer ? apiPatch<Customer>(`/customers/${customer.id}`, body) : apiPost<Customer>("/customers", Object.fromEntries(Object.entries(body).filter(([, x]) => x !== "")));
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(customer ? "Customer updated" : "Customer created");
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof FormValues, { message });
      setError(errorMessage(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={customer ? "Edit customer" : "New customer"} description="Customers are the clients you plan and quote trips for.">
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Name" htmlFor="cust-name" error={formState.errors.name?.message} required>
            <Input id="cust-name" autoComplete="off" {...register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="cust-email" error={formState.errors.email?.message}>
              <Input id="cust-email" type="email" autoComplete="off" {...register("email")} />
            </Field>
            <Field label="Phone" htmlFor="cust-phone" error={formState.errors.phone?.message}>
              <Input id="cust-phone" type="tel" autoComplete="off" {...register("phone")} />
            </Field>
            <Field label="Country (ISO code)" htmlFor="cust-country" error={formState.errors.country?.message} hint="Two letters, e.g. GB">
              <Input id="cust-country" maxLength={2} className="uppercase" {...register("country")} />
            </Field>
            <Field label="Preferred language" htmlFor="cust-lang" error={formState.errors.preferredLanguage?.message} hint="e.g. en">
              <Input id="cust-lang" maxLength={10} {...register("preferredLanguage")} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="cust-notes" error={formState.errors.notes?.message}>
            <Textarea id="cust-notes" rows={3} {...register("notes")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {customer ? "Save changes" : "Create customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
