"use client";
import * as React from "react";

/**
 * Cloudflare Turnstile widget. It renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; without it the
 * API's matching check (TURNSTILE_SECRET_KEY) is also off, so forms keep working in development.
 * The page's Content-Security-Policy must allow https://challenges.cloudflare.com for script, frame and connect.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const turnstileEnabled = !!SITE_KEY;

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error("Could not load the human-verification widget"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * `onToken(null)` means the token expired or failed and the form must not be submitted until a new one arrives.
 * Tokens are single-use: change `resetKey` after every submit attempt to get a fresh challenge.
 */
export function Turnstile({ onToken, resetKey = 0, action }: { onToken: (token: string | null) => void; resetKey?: number; action?: string }) {
  const host = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);
  const callback = React.useRef(onToken);
  callback.current = onToken;

  React.useEffect(() => {
    if (!SITE_KEY || !host.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    callback.current(null);
    loadScript()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        widgetId = window.turnstile.render(host.current, {
          sitekey: SITE_KEY,
          action,
          callback: (t: string) => callback.current(t),
          "expired-callback": () => callback.current(null),
          "error-callback": () => {
            callback.current(null);
            setFailed(true);
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey, action]);

  if (!SITE_KEY) return null;
  return (
    <div>
      <div ref={host} aria-label="Human verification" />
      {failed ? (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          Human verification could not load. Check your connection or disable content blockers for this site, then reload the page.
        </p>
      ) : null}
    </div>
  );
}
