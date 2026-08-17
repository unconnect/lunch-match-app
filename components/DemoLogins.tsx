// components/DemoLogins.tsx
//
// One-click sign-in for the seeded demo accounts, plus the full credential
// list. Publishing these credentials is deliberate — see lib/demoAccounts.ts.
// The accounts only exist after `npm run db:seed` has been run against the
// target database, so every failure path here says so.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { DEMO_ACCOUNTS, FEATURED_DEMO_ALIASES, findDemoAccount } from "@/lib/demoAccounts";

export function DemoLogins() {
  const router = useRouter();
  const [pendingAlias, setPendingAlias] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(alias: string) {
    const account = findDemoAccount(alias);
    if (!account) return;

    setPendingAlias(alias);
    setError(null);
    try {
      const result = await signIn("credentials", {
        accountId: account.accountId,
        recoveryKey: account.recoveryKey,
        redirect: false,
      });
      if (result?.error) {
        setError(
          "Demo-Anmeldung fehlgeschlagen — die Demo-Daten sind auf dieser Instanz vermutlich noch nicht eingespielt.",
        );
        return;
      }
      // Demo accounts have complete profiles, so the match view is the
      // interesting landing spot rather than /profil.
      router.push("/match-finden");
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setPendingAlias(null);
    }
  }

  return (
    <section aria-labelledby="demo-logins-heading" className="rounded-lg border p-4">
      <h2 id="demo-logins-heading" className="font-medium">
        Zum Ausprobieren: Demo-Konten
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Diese Konten sind mit Beispieldaten befüllt — Profile, Match-Anfragen und
        Nachrichten. „Nutzerin A“ hat Konversationen in jedem Status.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {FEATURED_DEMO_ALIASES.map((alias) => (
          <Button
            key={alias}
            variant="outline"
            size="sm"
            onClick={() => loginAs(alias)}
            disabled={pendingAlias !== null}
          >
            {pendingAlias === alias ? "Wird angemeldet…" : `Als ${alias} anmelden`}
          </Button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          Alle Demo-Zugangsdaten anzeigen
        </summary>
        <ul className="mt-2 space-y-1">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.accountId} className="text-sm">
              <span className="inline-block w-28 text-muted-foreground">{account.alias}</span>
              <span className="font-mono">{account.accountId}</span>
              <span className="mx-2 text-muted-foreground">/</span>
              <span className="break-all font-mono">{account.recoveryKey}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          Diese Zugangsdaten sind absichtlich öffentlich. Für dein eigenes Konto gilt das
          nicht — dessen Recovery-Key wird genau einmal angezeigt.
        </p>
      </details>
    </section>
  );
}
