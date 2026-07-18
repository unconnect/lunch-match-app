"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { z } from "zod";

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
    const result = await signIn("credentials", { ...values, redirect: false });
    if (result?.error) {
      setServerError("Ungültige Account-ID oder Recovery-Key.");
      return;
    }
    router.push("/profil");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Konto wiederherstellen</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Account-ID</span>
          <input {...register("accountId")} className="rounded border p-2 font-mono" />
          {errors.accountId && <span className="text-sm text-red-600">{errors.accountId.message}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Recovery-Key</span>
          <input {...register("recoveryKey")} className="rounded border p-2 font-mono" />
          {errors.recoveryKey && (
            <span className="text-sm text-red-600">{errors.recoveryKey.message}</span>
          )}
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Wird geprüft…" : "Anmelden"}
        </button>
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      </form>
      <a href="/" className="text-sm underline">
        Neues Konto erstellen
      </a>
    </main>
  );
}
