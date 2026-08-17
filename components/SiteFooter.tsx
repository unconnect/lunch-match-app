// components/SiteFooter.tsx
//
// Rendered on every page from the root layout. Both legal pages have to be
// reachable from anywhere without signing in ("leichte Erkennbarkeit und
// unmittelbare Erreichbarkeit"), which a footer link satisfies.
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 p-6 text-sm text-muted-foreground">
        <span>Lunch Match — Proof of Concept</span>
        <Link href="/impressum" className="underline hover:text-foreground">
          Impressum
        </Link>
        <Link href="/datenschutz" className="underline hover:text-foreground">
          Datenschutz
        </Link>
      </div>
    </footer>
  );
}
