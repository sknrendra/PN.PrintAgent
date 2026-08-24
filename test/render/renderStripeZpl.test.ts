import { describe, expect, it } from "vitest";
import { renderStripeZpl } from "../../src/render/zpl/renderStripeZpl.js";
import type { LabelSpec } from "../../src/config/labelSpec.js";
import type { PrinterProfile } from "../../src/config/printerProfile.js";

const label: LabelSpec = {
  schemaVersion: 1,
  name: "test label",
  width_mm: 50,
  height_mm: 30,
  margin_mm: 2,
  darkness: 15,
  speed_ips: 4,
};

const printer: PrinterProfile = {
  schemaVersion: 1,
  name: "test printer",
  dpi: 203,
  language: "zpl",
  transport: { type: "cups", queue: "TEST", copies: 1, timeout_ms: 15000 },
};

describe("renderStripeZpl", () => {
  it("wraps a single solid bar in ^XA/^XZ, sized and centered from the printable area", () => {
    const zpl = renderStripeZpl(label, printer).toString("ascii");

    expect(zpl.startsWith("^XA\n")).toBe(true);
    expect(zpl.endsWith("\n^XZ")).toBe(true);
    expect(zpl).toContain("^PW400");
    expect(zpl).toContain("^LL240");
    expect(zpl).toContain("^LH16,16");
    expect(zpl).toContain("^FO0,98");
    expect(zpl).toContain("^GB368,12,12^FS");
  });

  it("scales with a different label size and dpi", () => {
    const zpl = renderStripeZpl(
      { ...label, width_mm: 100, height_mm: 60, margin_mm: 0 },
      { ...printer, dpi: 300 },
    ).toString("ascii");

    // printable width/height == full label at 0 margin; stripe height = 6% of 60mm.
    expect(zpl).toContain(`^PW${Math.round((100 * 300) / 25.4)}`);
    expect(zpl).toContain(`^LL${Math.round((60 * 300) / 25.4)}`);
    expect(zpl).toContain("^LH0,0");
  });
});
