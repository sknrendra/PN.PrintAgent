import type { TextField } from "../../../config/template.js";
import { RenderError } from "../../../errors.js";
import { escapeZplText } from "../escape.js";
import { toDots } from "../units.js";

export function resolveTextValue(field: TextField, data: Record<string, string>): string {
  if (field.text !== undefined) return field.text;
  const value = data[field.name];
  if (!value) {
    throw new RenderError(`Missing required data field "${field.name}"`);
  }
  return value;
}

export function renderTextField(field: TextField, dpi: number, value: string): string {
  const x = toDots(field.x_mm, dpi);
  const y = toDots(field.y_mm, dpi);
  const height = toDots(field.height_mm, dpi);
  const widthPart = field.width_mm !== undefined ? `,${toDots(field.width_mm, dpi)}` : "";
  const text = field.maxLength !== undefined ? value.slice(0, field.maxLength) : value;

  return [
    `^FO${x},${y}`,
    `^A${field.font}N,${height}${widthPart}`,
    `^FD${escapeZplText(text)}^FS`,
  ].join("\n");
}
