"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Tags, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { apiBlob, apiGet, apiPost, errorMessage, openBlob } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, mealLabel } from "@/lib/utils";
import { ExpiryBadge } from "@/features/hotels/rates-tab";
import type { ImportResult, RatePlan } from "@/features/hotels/types";

const COLUMNS: { name: string; required: boolean; description: string; example: string }[] = [
  { name: "property", required: true, description: "Exact name of one of your properties", example: "Your Hotel Name" },
  { name: "roomType", required: true, description: "Exact name of an existing room type of that property", example: "Deluxe Room" },
  { name: "ratePlan", required: true, description: "Rate plan name; created if it does not exist yet", example: "Low season 2026/27" },
  { name: "mealPlan", required: true, description: "RO, BB, HB, FB or AI", example: "BB" },
  { name: "currency", required: true, description: "LKR, USD, EUR or GBP", example: "USD" },
  { name: "startDate", required: true, description: "First night, YYYY-MM-DD", example: "2026-11-01" },
  { name: "endDate", required: true, description: "Last night, YYYY-MM-DD", example: "2027-04-30" },
  { name: "amount", required: true, description: "Nightly amount in major units (e.g. 120.50)", example: "120.00" },
  { name: "taxBp", required: false, description: "Tax in basis points (1000 = 10%)", example: "1000" },
  { name: "serviceChargeBp", required: false, description: "Service charge in basis points", example: "1000" },
  { name: "taxIncluded", required: false, description: "true / false (yes, 1 also accepted)", example: "false" },
];
const TEMPLATE = `${COLUMNS.map((c) => c.name).join(",")}\n${COLUMNS.map((c) => c.example).join(",")}\n`;

function ExpiringSection() {
  const [days, setDays] = React.useState(30);
  const q = useQuery({ queryKey: ["expiring", days], queryFn: () => apiGet<RatePlan[]>("/rates/expiring", { days }) });
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Expiring and expired rate plans</CardTitle>
          <CardDescription>Active plans of your organisation that end within the window (or have already ended).</CardDescription>
        </div>
        <div className="w-44">
          <Select aria-label="Expiry window" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Within {d} days
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <LoadingBlock rows={3} label="Loading expiring rates" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load expiring rates" />
        ) : !q.data || q.data.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing expiring" description={`No active rate plans end within ${days} days.`} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Rate plans ending within {days} days</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3">Hotel</th>
                  <th scope="col" className="py-2 pr-3">Rate plan</th>
                  <th scope="col" className="py-2 pr-3">Room</th>
                  <th scope="col" className="py-2 pr-3">Meal</th>
                  <th scope="col" className="py-2 pr-3">Valid to</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2.5 pr-3">
                      <Link href={`/hotels/${p.propertyId}?tab=rates`} className="font-semibold text-primary hover:underline">
                        {p.propertyName ?? "Property"}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{p.name}</td>
                    <td className="py-2.5 pr-3">{p.roomTypeName}</td>
                    <td className="py-2.5 pr-3">{mealLabel(p.mealPlan)}</td>
                    <td className="tw-num py-2.5 pr-3">{formatDate(p.effectiveTo)}</td>
                    <td className="py-2.5">
                      <ExpiryBadge effectiveTo={p.effectiveTo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportWizard() {
  const qc = useQueryClient();
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  /** Base64 of a chosen .xlsx workbook; when set it is sent instead of the CSV text. */
  const [xlsx, setXlsx] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const run = useMutation({
    mutationFn: (commit: boolean) => apiPost<ImportResult>("/imports/rates", xlsx ? { xlsxBase64: xlsx, commit } : { csv, commit }),
    onSuccess: async (r) => {
      setResult(r);
      setError(null);
      if (!r.dryRun) {
        toast.success(`Imported ${r.validRows} row${r.validRows === 1 ? "" : "s"}: ${r.created.ratePlans} new plan${r.created.ratePlans === 1 ? "" : "s"}, ${r.created.rules} rule${r.created.rules === 1 ? "" : "s"}`);
        await Promise.all([qc.invalidateQueries({ queryKey: ["expiring"] }), qc.invalidateQueries({ queryKey: ["hotel"] })]);
      }
    },
    onError: (e) => {
      setResult(null);
      setError(errorMessage(e));
    },
  });
  const changeCsv = (t: string) => {
    setXlsx(null);
    setCsv(t);
    setResult(null);
    setError(null);
  };
  const step = result ? (result.dryRun ? 2 : 3) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="size-4" aria-hidden /> Import rates from CSV or Excel
        </CardTitle>
        <CardDescription>
          Step {step} of 3: {step === 1 ? "paste CSV or choose a CSV / Excel (.xlsx) file, then validate" : step === 2 ? "review the validation result, then import" : "import complete"}. Validation never changes data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <caption className="sr-only">Expected CSV columns</caption>
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">Column</th>
                <th scope="col" className="px-3 py-2">Required</th>
                <th scope="col" className="px-3 py-2">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 text-left font-mono font-semibold">{c.name}</th>
                  <td className="px-3 py-1.5">{c.required ? "Yes" : "Optional"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openBlob(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }), "rates-import-template.csv")}>
            <Download /> Download template
          </Button>
          <span className="text-xs text-muted-foreground">The template's example row uses placeholder names; replace them with your own properties and room types. Up to 2,000 rows per import. Existing plans are matched by room, name, meal plan and currency.</span>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field label="CSV or Excel (.xlsx) file" htmlFor="imp-file">
          <Input
            id="imp-file"
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="h-auto py-1.5"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1_000_000) {
                setError("The file is larger than 1 MB. Split it into several imports.");
                return;
              }
              setFileName(f.name);
              if (/.xlsx$/i.test(f.name)) {
                // Only the first worksheet is read, with the same columns as the CSV.
                const bytes = new Uint8Array(await f.arrayBuffer());
                let bin = "";
                for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                changeCsv("");
                setXlsx(btoa(bin));
                return;
              }
              changeCsv(await f.text());
            }}
          />
        </Field>
        {xlsx ? <Alert tone="info">Excel workbook <strong>{fileName}</strong> is ready. The first worksheet will be validated; nothing is imported until you confirm.</Alert> : null}
        <Field label={fileName && !xlsx ? `CSV content (${fileName})` : "…or paste CSV content"} htmlFor="imp-text">
          <Textarea id="imp-text" rows={8} className="font-mono text-xs" spellCheck={false} placeholder={COLUMNS.map((c) => c.name).join(",")} value={csv} onChange={(e) => changeCsv(e.target.value)} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={result?.dryRun ? "outline" : "default"} loading={run.isPending && run.variables === false} disabled={(!xlsx && csv.trim().length < 10) || run.isPending} onClick={() => run.mutate(false)}>
            <FileSpreadsheet /> Validate (dry run)
          </Button>
          {result?.dryRun ? (
            <Button variant="accent" loading={run.isPending && run.variables === true} disabled={result.validRows === 0 || run.isPending} onClick={() => run.mutate(true)}>
              <Upload /> Import {result.validRows} valid row{result.validRows === 1 ? "" : "s"}
            </Button>
          ) : null}
          {csv ? (
            <Button
              variant="ghost"
              onClick={() => {
                changeCsv("");
                setFileName(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {result ? (
          <div aria-live="polite" className="flex flex-col gap-3">
            <Alert tone={result.dryRun ? (result.errors.length ? "warning" : "success") : "success"} title={result.dryRun ? "Dry run result" : "Import complete"}>
              {result.totalRows} row{result.totalRows === 1 ? "" : "s"} read · {result.validRows} valid · {result.errors.length} with errors.
              {result.dryRun ? (result.errors.length ? " Rows with errors are skipped on import; fix them and validate again to include them." : " Nothing has been saved yet.") : ` Created ${result.created.ratePlans} rate plan(s) and ${result.created.rules} rule(s).`}
            </Alert>
            {result.errors.length > 0 ? (
              <div className="relative overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <caption className="sr-only">Rows with errors</caption>
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2">CSV line</th>
                      <th scope="col" className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((er, i) => (
                      <tr key={`${er.row}-${i}`} className="border-t border-border align-top">
                        <td className="tw-num px-3 py-2"><Badge tone="danger">Line {er.row}</Badge></td>
                        <td className="px-3 py-2">{er.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function RatesPage() {
  const can = useCan();
  const exportRates = useMutation({
    mutationFn: () => apiBlob("/exports/rates.csv"),
    onSuccess: (b) => {
      openBlob(b, "rates.csv");
      toast.success("Rates exported");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can("rates:read") && !can("imports:run"))
    return (
      <div>
        <PageHeader title="Rates & imports" />
        <Alert tone="warning" title="Not available to your role">You need the rates:read or imports:run permission.</Alert>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rates & imports"
        icon={Tags}
        description="Keep contract rates current: watch expiries, bulk-import seasonal rates and export what you have."
        actions={
          can("rates:read") ? (
            <Button variant="outline" loading={exportRates.isPending} onClick={() => exportRates.mutate()}>
              <Download /> Export rates CSV
            </Button>
          ) : null
        }
      />
      {can("rates:read") ? <ExpiringSection /> : null}
      {can("imports:run") ? (
        <ImportWizard />
      ) : (
        <Alert tone="info" title="CSV import">You do not have permission to run imports (imports:run).</Alert>
      )}
    </div>
  );
}
