"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div role="alert" className="tw-rise max-w-md text-center">
        <p className="tw-display text-[120px] text-white/90" aria-hidden>
          !
        </p>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Something went off course</h1>
        <p className="mt-3 text-sm text-muted-foreground">An unexpected error stopped this page from loading. Your data is safe. Try again, and if it keeps happening, let your administrator know.</p>
        {error.digest ? <p className="mt-3 text-xs text-muted-foreground">Reference: <span className="font-mono">{error.digest}</span></p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
