import type { LabelSpec } from "../../config/labelSpec.js";
import type { PrinterProfile } from "../../config/printerProfile.js";
import type { Template } from "../../config/template.js";
import { RenderError } from "../../errors.js";
import { renderBarcodeField } from "./fields/barcode.js";
import { renderTextField, resolveTextValue } from "./fields/text.js";
import { buildLabelHeader, LABEL_FOOTER } from "./header.js";

export type PrintJobData = Record<string, string>;

export function renderZpl(
  label: LabelSpec,
  printer: PrinterProfile,
  template: Template,
  data: PrintJobData,
): Buffer {
  const dpi = printer.dpi;

  // Resolve every text field's value up front so barcode fields can reuse it via `source`.
  const textValues = new Map<string, string>();
  for (const field of template.fields) {
    if (field.type === "text") {
      textValues.set(field.name, resolveTextValue(field, data));
    }
  }

  const fieldBlocks = template.fields.map((field) => {
    if (field.type === "text") {
      return renderTextField(field, dpi, textValues.get(field.name) as string);
    }

    const sourceField = template.fields.find((f) => f.name === field.source);
    if (!sourceField || sourceField.type !== "text") {
      throw new RenderError(
        `Barcode field "${field.name}" has source "${field.source}", which must be the name of a text field in the same template`,
      );
    }
    return renderBarcodeField(field, dpi, textValues.get(field.source) as string);
  });

  const zpl = [...buildLabelHeader(label, dpi), ...fieldBlocks, LABEL_FOOTER].join("\n");

  return Buffer.from(zpl, "ascii");
}
