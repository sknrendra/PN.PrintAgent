import type { LabelSpec } from "../../config/labelSpec.js";
import { toDots } from "./units.js";

const DEFAULT_DARKNESS = 15;
const DEFAULT_SPEED_IPS = 4;

export const LABEL_FOOTER = "^XZ";

export function buildLabelHeader(label: LabelSpec, dpi: number): string[] {
  const darkness = label.darkness ?? DEFAULT_DARKNESS;
  const speed = label.speed_ips ?? DEFAULT_SPEED_IPS;
  const marginDots = toDots(label.margin_mm, dpi);

  return [
    "^XA",
    `^PW${toDots(label.width_mm, dpi)}`,
    `^LL${toDots(label.height_mm, dpi)}`,
    `^LH${marginDots},${marginDots}`,
    `^MD${darkness}`,
    `^PR${speed}`,
  ];
}
