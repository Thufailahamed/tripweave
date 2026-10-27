"use client";
import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Alert, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/data-table";
import { apiList } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { NoAccess } from "@/features/settings/shared";

interface AuditEvent {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}

const RESOURCE_SUGGESTIONS = ["organization", "membership", "user", "trip_request", "quote", "property", "customer", "agreement"];

export default function AuditPage() {
  const can = useCan();
  const allowed = can("audit:read");
  const [page, setPage] = React.useState(1);
  const [draft, setDraft] = React.useState({ resourceType: "", action: "" });
  const [filters, setFilters] = React.useState({ resourceType: "", action: "" });
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["org-audit", page, filters],
    queryFn: () => apiList<AuditEvent>("/organization/audit", { page, pageSize: 25, resourceType: filters.resourceType.trim() || undefined, action: filters.action.trim() || undefined }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  if (!allowed) {
    return (
      <>
        <PageHeader title="Audit log" eyebrow="Settings" />
        <NoAccess what="The audit log" permission="audit:read" />
      </>
    );
  }
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const filtered = !!(filters.resourceType || filters.action);

  return (
    <>
      <PageHeader title="Audit log" eyebrow="Settings" icon={ScrollText} description="A record of who did what in your organisation, newest first. Passwords and secrets are not recorded." />
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters(draft);
        }}
      >
        <Field label="Resource type" htmlFor="a-res" className="w-48">
          <Input id="a-res" list="a-res-list" value={draft.resourceType} onChange={(e) => setDraft((d) => ({ ...d, resourceType: e.target.value }))} placeholder="e.g. quote" />
          <datalist id="a-res-list">
            {RESOURCE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Action starts with" htmlFor="a-act" className="w-56">
          <Input id="a-act" value={draft.action} onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))} placeholder="e.g. member." />
        </Field>
        <Button type="submit">Apply filters</Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft({ resourceType: "", action: "" });
              setFilters({ resourceType: "", action: "" });
              setPage(1);
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      {q.isLoading ? (
        <LoadingBlock label="Loading audit log" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? "No events match these filters" : "No audit events yet"} description={filtered ? "Try a broader action prefix or clear the filters." : "Actions such as sign-ins, team changes and quotation updates will appear here."} />
      ) : q.data ? (
        <Card className="overflow-hidden" aria-busy={q.isFetching}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Audit events, newest first</caption>
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Details</span>
                  </th>
                  {["When", "Who", "Action", "Resource"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((e) => {
                  const isOpen = open.has(e.id);
                  const hasMeta = Object.keys(e.metadata ?? {}).length > 0;
                  return (
                    <React.Fragment key={e.id}>
                      <tr className="border-t border-border align-top">
                        <td className="px-3 py-2.5">
                          <button className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} details for ${e.action}`} onClick={() => toggle(e.id)}>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </td>
                        <td className="tw-num whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                        <td className="px-3 py-2.5">{e.actorName ?? <span className="text-muted-foreground">System</span>}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold">{e.action}</td>
                        <td className="px-3 py-2.5">
                          <span>{e.resourceType}</span>
                          {e.resourceId ? <span className="ml-1 font-mono text-xs text-muted-foreground">{e.resourceId.slice(0, 10)}</span> : null}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-muted/40">
                          <td />
                          <td colSpan={4} className="px-3 py-3">
                            {hasMeta ? <pre className="relative overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-xs">{JSON.stringify(e.metadata, null, 2)}</pre> : <p className="text-xs text-muted-foreground">No additional details were recorded.</p>}
                            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              {e.resourceId ? (
                                <div>
                                  <dt className="inline font-semibold">Resource ID: </dt>
                                  <dd className="inline font-mono">{e.resourceId}</dd>
                                </div>
                              ) : null}
                              {e.requestId ? (
                                <div>
                                  <dt className="inline font-semibold">Request ID: </dt>
                                  <dd className="inline font-mono">{e.requestId}</dd>
                                </div>
                              ) : null}
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {q.data.meta.pages > 1 ? <Pagination meta={q.data.meta} onPageChange={setPage} /> : null}
        </Card>
      ) : null}
      <Alert tone="info" className="mt-4">
        The application offers no way to edit or delete audit events. Platform support access to your data is also recorded here.
      </Alert>
    </>
  );
}
