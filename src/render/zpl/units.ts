export function toDots(mm: number, dpi: number): number {
  return Math.round(mm * (dpi / 25.4));
}
