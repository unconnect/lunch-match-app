// lib/validation/matchRequest.ts
import { z } from "zod";

export const createMatchRequestSchema = z.object({
  toUserId: z.string().min(1),
  type: z.enum(["MANUAL", "MATCH_ME"]),
  message: z.string().min(1).max(2000),
});

export type CreateMatchRequestInput = z.infer<typeof createMatchRequestSchema>;

export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]).optional(),
  meetingPointQuery: z.string().min(1).max(200).optional(),
});

export type UpdateMatchRequestInput = z.infer<typeof updateMatchRequestSchema>;
