import { z } from "zod";

export const updateStatusSchema = z.enum([
  "idle",
  "checking",
  "available",
  "downloading",
  "downloaded",
  "manual-available",
  "up-to-date",
  "error"
]);

export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const updateStateSchema = z.object({
  status: updateStatusSchema,
  currentVersion: z.string(),
  availableVersion: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  releaseUrl: z.string().optional(),
  error: z.string().optional(),
  lastCheckedAt: z.string().optional()
});

export type UpdateState = z.infer<typeof updateStateSchema>;
