// app/match-finden/RequestDialog.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const schema = z.object({
  message: z.string().min(1, "Nachricht darf nicht leer sein").max(2000),
});

type FormValues = z.infer<typeof schema>;

interface RequestDialogProps {
  person: { id: string; alias: string | null };
  onClose: () => void;
  onSent: (matchRequestId: string) => void;
}

export function RequestDialog({ person, onClose, onSent }: RequestDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const sendRequestMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch("/api/match-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: person.id, type: "MANUAL", message: values.message }),
      });
      if (!res.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => onSent(created.id),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Anfrage an {person.alias ?? "Teilnehmende Person"}</DialogTitle>
        <form
          onSubmit={handleSubmit((values) => sendRequestMutation.mutate(values))}
          className="flex flex-col gap-3"
        >
          <Textarea {...register("message")} placeholder="Deine Nachricht…" rows={4} />
          {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
          <Button type="submit" disabled={sendRequestMutation.isPending}>
            {sendRequestMutation.isPending ? "Wird gesendet…" : "Senden"}
          </Button>
          {sendRequestMutation.isError && (
            <p className="text-sm text-destructive">{(sendRequestMutation.error as Error).message}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
