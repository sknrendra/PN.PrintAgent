import { z } from "zod";

const BaseFieldSchema = z.object({
  name: z.string(),
  x_mm: z.number(),
  y_mm: z.number(),
});

export const TextFieldSchema = BaseFieldSchema.extend({
  type: z.literal("text"),
  text: z.string().optional(),
  font: z.string().default("0"),
  height_mm: z.number().positive(),
  width_mm: z.number().positive().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const BarcodeFieldSchema = BaseFieldSchema.extend({
  type: z.literal("barcode"),
  source: z.string(),
  height_mm: z.number().positive(),
  moduleWidth_dots: z.number().int().positive().default(2),
  printText: z.boolean().default(false),
});

export const FieldSchema = z.discriminatedUnion("type", [TextFieldSchema, BarcodeFieldSchema]);

export type TextField = z.infer<typeof TextFieldSchema>;
export type BarcodeField = z.infer<typeof BarcodeFieldSchema>;
export type Field = z.infer<typeof FieldSchema>;

export const TemplateSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string(),
    fields: z.array(FieldSchema).min(1),
  })
  .superRefine((template, ctx) => {
    const names = new Set(template.fields.map((f) => f.name));
    template.fields.forEach((field, index) => {
      if (field.type === "barcode" && !names.has(field.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", index, "source"],
          message: `barcode field "${field.name}" has source "${field.source}", which is not the name of any field in this template`,
        });
      }
    });
  });

export type Template = z.infer<typeof TemplateSchema>;
