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
  meetingPointQuery: z.string().min(1).max(200).optional(),
});

export type UpdateMatchRequestInput = z.infer<typeof updateMatchRequestSchema>;
