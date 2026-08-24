import { z } from "zod";

export const LabelSpecSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  width_mm: z.number().positive(),
  height_mm: z.number().positive(),
  margin_mm: z.number().nonnegative().default(0),
  darkness: z.number().int().min(0).max(30).optional(),
  speed_ips: z.number().positive().optional(),
});

export type LabelSpec = z.infer<typeof LabelSpecSchema>;
