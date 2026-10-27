"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/lib/utils";

export interface MonthlyDatum {
  month: string;
  created: number;
  accepted: number;
}

const monthLabel = (m: string) => formatDate(`${m}-01`, { month: "short", year: "numeric" });

/** Grouped columns: quotations created vs accepted per month, with a data table for assistive tech and print. */
export function MonthlyChart({ data }: { data: MonthlyDatum[] }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  const summary = rows.map((r) => `${r.label}: ${r.created} created, ${r.accepted} accepted`).join("; ");
  return (
    <div>
      <div role="img" aria-label={`Quotations created and accepted per month. ${summary}`} className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="rgba(128,140,160,0.22)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8a93a6" }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8a93a6" }} />
            <Tooltip cursor={{ fill: "rgba(128,140,160,0.12)" }} contentStyle={{ borderRadius: 10, background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", fontSize: 12 }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="created" name="Created" fill="#5b7cfa" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="accepted" name="Accepted" fill="#fb9a2c" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-primary">View as table</summary>
        <table className="mt-2 w-full border-collapse text-sm">
          <caption className="sr-only">Quotations created and accepted per month</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 text-left font-semibold">Month</th>
              <th scope="col" className="py-1 text-right font-semibold">Created</th>
              <th scope="col" className="py-1 text-right font-semibold">Accepted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal">{r.label}</th>
                <td className="tw-num py-1 text-right">{r.created}</td>
                <td className="tw-num py-1 text-right">{r.accepted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
