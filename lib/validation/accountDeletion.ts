// lib/validation/accountDeletion.ts
import { z } from "zod";

// The user must type their own Account ID to confirm deletion. The client
// disables the button until it matches, but the route handler re-checks it
// against the session user's real Account ID — this schema only guarantees
// that *something* was sent, never that it is correct.
export const deleteAccountSchema = z.object({
  confirmation: z.string().min(1, "Bitte gib deine Account-ID ein."),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
