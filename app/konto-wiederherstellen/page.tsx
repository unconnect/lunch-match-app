"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  accountId: z.string().min(1, "Account-ID wird benötigt"),
  recoveryKey: z.string().min(1, "Recovery-Key wird benötigt"),
});

type FormValues = z.infer<typeof schema>;

export default function KontoWiederherstellenPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await signIn("credentials", { ...values, redirect: false });
      if (result?.error) {
        setServerError("Ungültige Account-ID oder Recovery-Key.");
        return;
      }
      router.push("/profil");
    } catch {
      setServerError(
        "Verbindung fehlgeschlagen. Bitte überprüfe deine Internetverbindung und versuche es erneut.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Konto wiederherstellen</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="accountId">Account-ID</Label>
          <Input id="accountId" {...register("accountId")} className="font-mono" />
          {errors.accountId && (
            <span className="text-sm text-destructive">{errors.accountId.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="recoveryKey">Recovery-Key</Label>
          <Input id="recoveryKey" {...register("recoveryKey")} className="font-mono" />
          {errors.recoveryKey && (
            <span className="text-sm text-destructive">{errors.recoveryKey.message}</span>
          )}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Wird geprüft…" : "Anmelden"}
        </Button>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      </form>
      <Link href="/" className="text-sm text-muted-foreground underline hover:text-foreground">
        Neues Konto erstellen
      </Link>
    </main>
  );
}
