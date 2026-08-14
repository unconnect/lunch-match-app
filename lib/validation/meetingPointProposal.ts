import { z } from "zod";

// A proposal is either a structured point (from a suggestion pick) or free
// text to geocode server-side.
export const createProposalSchema = z.union([
  z.object({
    name: z.string().min(1).max(200),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
  z.object({ query: z.string().min(1).max(200) }),
]);

export const respondProposalSchema = z.object({
  action: z.enum(["accept", "reject"]),
});
