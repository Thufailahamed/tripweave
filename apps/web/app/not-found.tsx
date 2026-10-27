import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="tw-rise max-w-md text-center">
        <p className="tw-display text-[120px] text-white/90" aria-hidden>
          404
        </p>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">This route is off the map</h1>
        <p className="mt-3 text-sm text-muted-foreground">The page you are looking for does not exist or has moved. Check the address, or head back to somewhere familiar.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
