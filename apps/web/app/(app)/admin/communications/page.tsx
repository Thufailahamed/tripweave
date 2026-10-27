"use client";
import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Archive, Mail, Megaphone, Pencil, Plus, RefreshCw, Search, Send, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { ApiError, apiDelete, apiGet, apiList, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AdminEmailRow, Announcement } from "@/features/admin/types";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(160, "At most 160 characters"),
    body: z.string().trim().max(4000, "At most 4,000 characters"),
    tone: z.enum(["info", "success", "warning", "danger"]),
    status: z.enum(["draft", "active", "archived"]),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), { message: "The end must be after the start", path: ["endsAt"] });
type AnnouncementValues = z.input<typeof announcementSchema>;

function AnnouncementDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Announcement | null }) {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const defaults = (a: Announcement | null): AnnouncementValues => ({ title: a?.title ?? "", body: a?.body ?? "", tone: a?.tone ?? "info", status: a?.status ?? "draft", startsAt: toLocalInput(a?.startsAt ?? null), endsAt: toLocalInput(a?.endsAt ?? null) });
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<AnnouncementValues>({ resolver: zodResolver(announcementSchema) as never, defaultValues: defaults(editing) });
  React.useEffect(() => reset(defaults(editing)), [editing, reset]);
  const save = useMutation({
    mutationFn: (v: AnnouncementValues) => {
      const payload = { ...v, startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null, endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null };
      return editing ? apiPatch<Announcement>(`/admin/announcements/${editing.id}`, payload) : apiPost<Announcement>("/admin/announcements", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Announcement updated" : "Announcement created");
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      qc.invalidateQueries({ queryKey: ["platform-config"] });
      onOpenChange(false);
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(announcementSchema.parse(v));
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof AnnouncementValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit announcement" : "New announcement"} description="Active announcements appear as a banner in the app shell. Leave the window blank to publish immediately and keep it live until archived." wide>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Title" htmlFor="an-title" error={formState.errors.title?.message} required><Input id="an-title" {...register("title")} /></Field>
          <Field label="Message" htmlFor="an-body" error={formState.errors.body?.message}><Textarea id="an-body" rows={4} maxLength={4000} {...register("body")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tone" htmlFor="an-tone" error={formState.errors.tone?.message}><Select id="an-tone" {...register("tone")}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="danger">Critical</option></Select></Field>
            <Field label="Status" htmlFor="an-status" error={formState.errors.status?.message}><Select id="an-status" {...register("status")}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select></Field>
            <Field label="Starts at" htmlFor="an-start" error={formState.errors.startsAt?.message} hint="Optional. Local time."><Input id="an-start" type="datetime-local" {...register("startsAt")} /></Field>
            <Field label="Ends at" htmlFor="an-end" error={formState.errors.endsAt?.message} hint="Optional. Local time."><Input id="an-end" type="datetime-local" {...register("endsAt")} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={save.isPending}><Send /> {editing ? "Save announcement" : "Publish announcement"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [deleting, setDeleting] = React.useState<Announcement | null>(null);
  React.useEffect(() => setPage(1), [status]);
  const list = useQuery({ queryKey: ["admin-announcements", status, page], queryFn: () => apiList<Announcement>("/admin/announcements", { status: status || undefined, page, pageSize: 20 }), placeholderData: keepPreviousData });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    qc.invalidateQueries({ queryKey: ["platform-config"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const setStatusMutation = useMutation({
    mutationFn: (v: { id: string; status: string }) => apiPatch(`/admin/announcements/${v.id}`, { status: v.status }),
    onSuccess: () => {
      toast.success("Announcement updated");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/announcements/${id}`),
    onSuccess: () => {
      toast.success("Announcement deleted");
      refresh();
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setDialogOpen(true);
  };
  const columns = React.useMemo<ColumnDef<Announcement, any>[]>(
    () => [
      { accessorKey: "title", header: "Announcement", cell: ({ row }) => <div className="min-w-0 max-w-md"><p className="truncate font-semibold">{row.original.title}</p><p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body || "No body"}</p></div> },
      { accessorKey: "tone", header: "Tone", cell: ({ row }) => <Badge tone={row.original.tone === "danger" ? "danger" : row.original.tone === "warning" ? "warning" : row.original.tone === "success" ? "success" : "info"}>{titleCase(row.original.tone)}</Badge> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: "window", header: "Window", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.startsAt ? formatDateTime(row.original.startsAt) : "Immediate"} → {row.original.endsAt ? formatDateTime(row.original.endsAt) : "No end"}</span> },
      { accessorKey: "createdByName", header: "Created by", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.createdByName ?? "—"}</span> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.status === "active" ? (
              <Button size="sm" variant="ghost" onClick={() => setStatusMutation.mutate({ id: row.original.id, status: "archived" })}><Archive /> Archive</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setStatusMutation.mutate({ id: row.original.id, status: "active" })}><Megaphone /> Activate</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openEdit(row.original)} aria-label={`Edit ${row.original.title}`}><Pencil /></Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(row.original)} aria-label={`Delete ${row.original.title}`}><Trash2 /></Button>
          </div>
        ),
      },
    ],
    [setStatusMutation],
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Filter announcements by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44"><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select>
        <Button variant="accent" onClick={openCreate}><Plus /> New announcement</Button>
      </div>
      {list.isLoading ? <LoadingBlock label="Loading announcements" /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <DataTable data={list.data?.items ?? []} columns={columns} caption="Platform announcements" meta={list.data?.meta} onPageChange={setPage} empty={<EmptyState icon={Megaphone} title="No announcements" description="Create one to show a banner to every signed-in user." action={<Button variant="accent" onClick={openCreate}><Plus /> New announcement</Button>} />} />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Only one banner is shown at a time: the newest active announcement whose window contains the current time. Users can dismiss it.</p>
      <AnnouncementDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={deleting ? `Delete “${deleting.title}”?` : ""} description="This removes the announcement permanently. Archiving keeps it for history." confirmLabel="Delete" destructive loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

function EmailsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const q = useDebounced(search.trim());
  React.useEffect(() => setPage(1), [q, status]);
  const stats = useQuery({ queryKey: ["admin-email-stats"], queryFn: () => apiGet<{ pending: number; sent: number; failed: number }>("/admin/emails/stats") });
  const list = useQuery({ queryKey: ["admin-emails", q, status, page], queryFn: () => apiList<AdminEmailRow>("/admin/emails", { q, status: status || undefined, page, pageSize: 30 }), placeholderData: keepPreviousData });
  const resend = useMutation({
    mutationFn: (id: string) => apiPost<{ delivered: boolean }>(`/admin/emails/${id}/resend`),
    onSuccess: (r) => {
      toast.success(r.delivered ? "Email delivered" : "Email queued in the outbox");
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
      qc.invalidateQueries({ queryKey: ["admin-email-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns = React.useMemo<ColumnDef<AdminEmailRow, any>[]>(
    () => [
      { accessorKey: "toEmail", header: "Recipient", cell: ({ row }) => <span className="text-sm font-medium">{row.original.toEmail}</span> },
      { accessorKey: "subject", header: "Subject", cell: ({ row }) => <div className="min-w-0 max-w-sm"><p className="truncate text-sm">{row.original.subject}</p>{row.original.error ? <p className="truncate text-[10px] text-destructive">{row.original.error}</p> : null}</div> },
      { accessorKey: "organizationName", header: "Organisation", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.organizationName ?? "Platform"}</span> },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "createdAt", header: "Queued", cell: ({ row }) => <span className="tw-num text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span> },
      { accessorKey: "sentAt", header: "Sent", cell: ({ row }) => <span className="tw-num text-xs text-muted-foreground">{row.original.sentAt ? formatDateTime(row.original.sentAt) : "—"}</span> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => resend.mutate(row.original.id)} loading={resend.isPending && resend.variables === row.original.id}><RefreshCw /> Resend</Button>,
      },
    ],
    [resend],
  );
  const s = stats.data;
  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat icon={Mail} iconTone="warning" label="Pending" value={s?.pending ?? 0} hint="Queued, not yet delivered" />
        <Stat icon={Send} iconTone="success" label="Delivered" value={s?.sent ?? 0} />
        <Stat icon={Mail} iconTone="danger" label="Failed" value={s?.failed ?? 0} hint="Review the error, then resend" />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Filter email status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44"><option value="">All statuses</option><option value="pending">Pending</option><option value="sent">Sent</option><option value="failed">Failed</option></Select>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label="Search emails" placeholder="Recipient or subject…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-8" /></div>
      </div>
      {list.isLoading ? <LoadingBlock label="Loading email outbox" /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <DataTable data={list.data?.items ?? []} columns={columns} caption="Email outbox" meta={list.data?.meta} onPageChange={setPage} empty={<EmptyState icon={Mail} title="No emails match these filters" description="Every verification, reset and notification email is recorded here." />} />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Resending duplicates the original message into the outbox. Message bodies are never shown here; delivery errors are recorded for support.</p>
    </>
  );
}

export default function AdminCommunicationsPage() {
  return (
    <>
      <PageHeader
        title="Communications"
        eyebrow="Platform administration"
        description="Publish platform-wide announcements and operate the email outbox. Announcements appear in the app shell until archived or their window ends."
        icon={Megaphone}
        image={IMAGES.features}
      />
      <Tabs defaultValue="announcements">
        <TabsList><TabsTrigger value="announcements">Announcements</TabsTrigger><TabsTrigger value="emails">Email outbox</TabsTrigger></TabsList>
        <TabsContent value="announcements"><AnnouncementsTab /></TabsContent>
        <TabsContent value="emails"><EmailsTab /></TabsContent>
      </Tabs>
    </>
  );
}
