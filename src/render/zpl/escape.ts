export function escapeZplText(value: string): string {
  return value.replace(/[\^~]/g, "");
}
