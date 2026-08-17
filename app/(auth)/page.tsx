"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DemoLogins } from "@/components/DemoLogins";
import { ProofOfConceptNotice } from "@/components/ProofOfConceptNotice";

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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lunch Match</h1>

      {step === "start" && (
        <>
          <ProofOfConceptNotice />
          <p>
            Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe — ganz ohne
            E-Mail-Adresse oder Passwort.
          </p>
          <Button
            onClick={() => createIdentityMutation.mutate()}
            disabled={createIdentityMutation.isPending}
          >
            {createIdentityMutation.isPending ? "Wird erstellt…" : "Neues Konto erstellen"}
          </Button>
          <Link href="/konto-wiederherstellen" className="text-sm text-muted-foreground underline hover:text-foreground">
            Ich habe bereits ein Konto
          </Link>
          {createIdentityMutation.isError && (
            <p className="text-sm text-destructive">{createIdentityMutation.error.message}</p>
          )}
          <DemoLogins />
        </>
      )}

      {step === "created" && identity && (
        <>
          <p className="font-medium">
            Speichere diese Zugangsdaten jetzt sicher ab — sie werden nur einmal angezeigt und
            können nicht wiederhergestellt werden, wenn du sie verlierst.
          </p>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Account-ID</p>
              <p className="font-mono text-lg">{identity.accountId}</p>
              <p className="mt-2 text-sm text-muted-foreground">Recovery-Key</p>
              <p className="break-all font-mono text-lg">{identity.recoveryKey}</p>
            </CardContent>
          </Card>
          <div className="flex items-center gap-2">
            <Checkbox
              id="confirm-saved"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="confirm-saved" className="text-sm font-normal">
              Ich habe Account-ID und Recovery-Key sicher gespeichert.
            </Label>
          </div>
          <Button onClick={handleConfirm} disabled={!confirmed || signingIn}>
            {signingIn ? "Wird angemeldet…" : "Weiter zum Profil"}
          </Button>
          {signInError && <p className="text-sm text-destructive">{signInError}</p>}
        </>
      )}
    </main>
  );
}
