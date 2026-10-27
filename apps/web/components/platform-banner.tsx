"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

interface PlatformConfig {
  signupsEnabled: boolean;
  maintenanceMode: boolean;
  supportEmail: string;
  announcement: { id: string; title: string; body: string; tone: "info" | "success" | "warning" | "danger" } | null;
}

const STORAGE_KEY = "tw.announcement.dismissed";

/** Active platform announcement, dismissible per announcement id. */
export function PlatformBanner() {
  const q = useQuery({ queryKey: ["platform-config"], queryFn: () => apiGet<PlatformConfig>("/public/platform"), staleTime: 60_000, retry: false });
  const [dismissed, setDismissed] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const a = q.data?.announcement;
  if (!a || dismissed === a.id) return null;
  return (
    <div className="mb-5">
      <Alert tone={a.tone} title={a.title}>
        <div className="flex items-start justify-between gap-4">
          <p className="whitespace-pre-line">{a.body}</p>
          <button
            type="button"
            aria-label="Dismiss announcement"
            className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
            onClick={() => {
              setDismissed(a.id);
              try {
                localStorage.setItem(STORAGE_KEY, a.id);
              } catch {
                /* storage unavailable */
              }
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      </Alert>
    </div>
  );
}
