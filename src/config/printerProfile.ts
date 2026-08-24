import { z } from "zod";

const CupsTransportSchema = z.object({
  type: z.literal("cups"),
  queue: z.string(),
  copies: z.number().int().positive().default(1),
  timeout_ms: z.number().positive().default(15000),
});

const WindowsTransportSchema = z.object({
  type: z.literal("windows"),
  share: z.string(),
  timeout_ms: z.number().positive().default(15000),
});

export const TransportConfigSchema = z.discriminatedUnion("type", [
  CupsTransportSchema,
  WindowsTransportSchema,
]);

export type CupsTransportConfig = z.infer<typeof CupsTransportSchema>;
export type WindowsTransportConfig = z.infer<typeof WindowsTransportSchema>;
export type TransportConfig = z.infer<typeof TransportConfigSchema>;

export const PrinterProfileSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  dpi: z.number().int().positive(),
  language: z.literal("zpl"),
  transport: TransportConfigSchema,
});

export type PrinterProfile = z.infer<typeof PrinterProfileSchema>;
