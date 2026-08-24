import { describe, expect, it } from "vitest";
import { loadYaml } from "../../src/config/loadYaml.js";
import { LabelSpecSchema } from "../../src/config/labelSpec.js";
import { PrinterProfileSchema } from "../../src/config/printerProfile.js";
import { TemplateSchema } from "../../src/config/template.js";
import { ConfigError } from "../../src/errors.js";

describe("loadYaml", () => {
  it("loads and validates the real 50x30mm label spec", () => {
    const label = loadYaml("examples/labels/label-50x30.yaml", LabelSpecSchema);
    expect(label.width_mm).toBe(50);
    expect(label.height_mm).toBe(30);
    expect(label.margin_mm).toBe(2);
    expect(label.darkness).toBe(15);
  });

  it("loads and validates the real ZD220 CUPS printer profile", () => {
    const printer = loadYaml("examples/printers/zd220-cups.yaml", PrinterProfileSchema);
    expect(printer.dpi).toBe(203);
    expect(printer.transport).toEqual({
      type: "cups",
      queue: "ZTC-ZD220-203dpi-ZPL",
      copies: 1,
      timeout_ms: 15000,
    });
  });

  it("loads and validates the Windows print-share printer profile", () => {
    const printer = loadYaml("examples/printers/zd220-windows.yaml", PrinterProfileSchema);
    expect(printer.transport).toEqual({
      type: "windows",
      share: "\\\\localhost\\ZD220",
      timeout_ms: 15000,
    });
  });

  it("throws a readable ConfigError for a missing file", () => {
    expect(() => loadYaml("test/fixtures/does-not-exist.yaml", LabelSpecSchema)).toThrow(
      ConfigError,
    );
  });

  it("throws a readable ConfigError for invalid types in a label spec", () => {
    expect(() => loadYaml("test/fixtures/broken-label.yaml", LabelSpecSchema)).toThrow(
      /width_mm|height_mm/,
    );
  });

  it("throws a readable ConfigError for an unknown transport type", () => {
    expect(() =>
      loadYaml("test/fixtures/broken-printer-transport.yaml", PrinterProfileSchema),
    ).toThrow(ConfigError);
  });

  it("throws a readable ConfigError when a barcode source references an unknown field", () => {
    expect(() => loadYaml("test/fixtures/broken-template-source.yaml", TemplateSchema)).toThrow(
      /does_not_exist/,
    );
  });
});
