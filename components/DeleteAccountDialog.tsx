// components/DeleteAccountDialog.tsx
//
// Irreversible account deletion, guarded the way GitHub guards a repository
// delete: the user has to type their own Account ID before the button becomes
// usable. The friction is the point — this is not a step anyone should be able
// to complete by reflex, and there is no undo, no recovery key, no support
// address behind it.
//
// The typed value is sent to the server and compared there against the session
// user's real Account ID. Everything here is convenience; the check that counts
// lives in app/api/identity/route.ts.
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccountDialog() {
  const { data: session } = useSession();
  // The JWT callback puts the Account ID on session.user.name (see auth.ts).
  const accountId = session?.user?.name ?? null;

  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/identity", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string" ? body.error : "Konto konnte nicht gelöscht werden."
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      // The session's user row is now an empty shell that can never sign in
      // again, so the token must go with it.
      await signOut({ callbackUrl: "/" });
    },
  });

  const matches = accountId !== null && confirmation.trim() === accountId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmation("");
          deleteMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Konto löschen</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Konto endgültig löschen</DialogTitle>

        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p>Dabei werden unwiderruflich gelöscht:</p>
          <ul className="list-disc pl-5">
            <li>dein Profil samt Standort, Branche, Position und Schritteziel</li>
            <li>alle Nachrichten, die du geschrieben hast</li>
            <li>alle Treffpunkt-Vorschläge von dir</li>
            <li>deine Account-ID und dein Recovery-Key — beide funktionieren danach nicht mehr</li>
          </ul>
          <p>
            Personen, mit denen du im Austausch warst, sehen die Unterhaltung weiterhin — aber
            ohne deine Nachrichten und nur noch mit dem Hinweis, dass das Konto gelöscht wurde.
          </p>
          <p className="font-medium text-foreground">
            Es gibt keine Wiederherstellung. Auch wir können das Konto nicht zurückholen.
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor="delete-confirmation">
              Gib zur Bestätigung deine Account-ID{" "}
              <span className="font-mono">{accountId ?? "…"}</span> ein:
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="delete-confirmation-hint"
            />
            <p id="delete-confirmation-hint" className="text-muted-foreground">
              Die Eingabe muss exakt übereinstimmen.
            </p>
          </div>

          {deleteMutation.isError && (
            <p className="text-destructive">{deleteMutation.error.message}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={!matches || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Wird gelöscht…" : "Konto unwiderruflich löschen"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
