// lib/validation/profile.ts
import { z } from "zod";

export const locationPrecisionValues = ["EXACT", "POSTAL_CODE", "CITY"] as const;
export const karrierelevelValues = [
  "ANGESTELLT",
  "MITTLERES_MANAGEMENT",
  "LEITEND",
  "GESCHAEFTSFUEHRUNG",
] as const;

export const profileSchema = z.object({
  alias: z.string().min(1, "Alias wird benötigt").max(50),
  locationQuery: z.string().min(1, "Standort wird benötigt").max(200),
  locationPrecision: z.enum(locationPrecisionValues),
  branche: z.string().max(100).optional().or(z.literal("")),
  brancheVisible: z.boolean(),
  position: z.string().max(100).optional().or(z.literal("")),
  karrierelevel: z.enum(karrierelevelValues).optional().or(z.literal("")),
  // Preprocess "" / null to undefined *before* coercion runs: z.coerce.number()
  // turns "" into 0 (Number("") === 0), which would then fail .positive() and
  // block users from clearing a previously-set Schritteziel. Treating an
  // empty field as "no value" (rather than "invalid value") lets the field
  // round-trip through form -> API -> DB -> form as cleared.
  schritteziel: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.coerce.number().int().positive().max(20000).optional()
  ),
});

export type ProfileInput = z.infer<typeof profileSchema>;
