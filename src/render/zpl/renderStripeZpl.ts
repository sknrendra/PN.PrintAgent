import type { LabelSpec } from "../../config/labelSpec.js";
import type { PrinterProfile } from "../../config/printerProfile.js";
import { buildLabelHeader, LABEL_FOOTER } from "./header.js";
import { toDots } from "./units.js";

// A long solid bar printed as its own label, spanning the printable width, centered in the
// printable height -- a physical separator between batches of real labels. This proportion is
// a first-pass guess; adjust after checking a real print, same as the part-number template.
const STRIPE_HEIGHT_FRACTION = 0.06;

export function renderStripeZpl(label: LabelSpec, printer: PrinterProfile): Buffer {
  const dpi = printer.dpi;
  const printableWidth_mm = label.width_mm - 2 * label.margin_mm;
  const printableHeight_mm = label.height_mm - 2 * label.margin_mm;
  const stripeHeight_mm = printableHeight_mm * STRIPE_HEIGHT_FRACTION;
  const y_mm = (printableHeight_mm - stripeHeight_mm) / 2;

  const widthDots = toDots(printableWidth_mm, dpi);
  const heightDots = toDots(stripeHeight_mm, dpi);

  const zpl = [
    ...buildLabelHeader(label, dpi),
    `^FO0,${toDots(y_mm, dpi)}`,
    `^GB${widthDots},${heightDots},${heightDots}^FS`,
    LABEL_FOOTER,
  ].join("\n");

  return Buffer.from(zpl, "ascii");
}
