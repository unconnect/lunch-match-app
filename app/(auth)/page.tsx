"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { signIn } from "next-auth/react";

type Step = "start" | "created";

interface IdentityResponse {
  accountId: string;
  recoveryKey: string;
}

export default function LandingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [identity, setIdentity] = useState<IdentityResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const createIdentityMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/identity", { method: "POST" });
      if (!response.ok) throw new Error("Konto konnte nicht erstellt werden.");
      return (await response.json()) as IdentityResponse;
    },
    onSuccess: (data) => {
      setIdentity(data);
      setStep("created");
    },
  });

  async function handleConfirm() {
    if (!identity) return;
    setSigningIn(true);
    setSignInError(null);
    try {
      const result = await signIn("credentials", {
        accountId: identity.accountId,
        recoveryKey: identity.recoveryKey,
        redirect: false,
      });
      if (result?.error) {
        setSignInError("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
        return;
      }
      router.push("/profil");
    } catch {
      setSignInError(
        "Verbindung fehlgeschlagen. Bitte überprüfe deine Internetverbindung und versuche es erneut.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lunch Match</h1>

      {step === "start" && (
        <>
          <p>
            Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe — ganz ohne
            E-Mail-Adresse oder Passwort.
          </p>
          <button
            onClick={() => createIdentityMutation.mutate()}
            disabled={createIdentityMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {createIdentityMutation.isPending ? "Wird erstellt…" : "Neues Konto erstellen"}
          </button>
          <Link href="/konto-wiederherstellen" className="text-sm underline">
            Ich habe bereits ein Konto
          </Link>
          {createIdentityMutation.isError && (
            <p className="text-sm text-red-600">{createIdentityMutation.error.message}</p>
          )}
        </>
      )}

      {step === "created" && identity && (
        <>
          <p className="font-medium">
            Speichere diese Zugangsdaten jetzt sicher ab — sie werden nur einmal angezeigt und
            können nicht wiederhergestellt werden, wenn du sie verlierst.
          </p>
          <div className="rounded border p-4">
            <p className="text-sm text-slate-500">Account-ID</p>
            <p className="font-mono text-lg">{identity.accountId}</p>
            <p className="mt-2 text-sm text-slate-500">Recovery-Key</p>
            <p className="break-all font-mono text-lg">{identity.recoveryKey}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Ich habe Account-ID und Recovery-Key sicher gespeichert.
          </label>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || signingIn}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {signingIn ? "Wird angemeldet…" : "Weiter zum Profil"}
          </button>
          {signInError && <p className="text-sm text-red-600">{signInError}</p>}
        </>
      )}
    </main>
  );
}
