import type { BarcodeField } from "../../../config/template.js";
import { escapeZplText } from "../escape.js";
import { toDots } from "../units.js";

export function renderBarcodeField(field: BarcodeField, dpi: number, value: string): string {
  const x = toDots(field.x_mm, dpi);
  const y = toDots(field.y_mm, dpi);
  const height = toDots(field.height_mm, dpi);
  const printLine = field.printText ? "Y" : "N";

  return [
    `^FO${x},${y}`,
    `^BY${field.moduleWidth_dots}`,
    `^BCN,${height},${printLine},N,N`,
    `^FD${escapeZplText(value)}^FS`,
  ].join("\n");
}
