// lib/validation/matchRequest.ts
import { z } from "zod";

export const createMatchRequestSchema = z.object({
  toUserId: z.string().min(1),
  type: z.enum(["MANUAL", "MATCH_ME"]),
  message: z.string().min(1).max(2000),
});

export type CreateMatchRequestInput = z.infer<typeof createMatchRequestSchema>;

// ACCEPTED / DECLINED may only be set by the recipient; WITHDRAWN only by the
// sender. The schema accepts all three; the route enforces who may set which.
export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]).optional(),
  // Free-text meeting point — geocoded by the route.
  meetingPointQuery: z.string().min(1).max(200).optional(),
  // Structured meeting point — a known name + coordinates, applied directly
  // (no geocode). Used by the overlap-suggestion picks on the detail page.
  meetingPoint: z
    .object({
      name: z.string().min(1).max(200),
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
    })
    .optional(),
});

export type UpdateMatchRequestInput = z.infer<typeof updateMatchRequestSchema>;
