import { describe, expect, it } from "vitest";
import { renderZpl } from "../../src/render/zpl/renderZpl.js";
import { RenderError } from "../../src/errors.js";
import { loadYaml } from "../../src/config/loadYaml.js";
import { LabelSpecSchema } from "../../src/config/labelSpec.js";
import { PrinterProfileSchema } from "../../src/config/printerProfile.js";
import type { Template } from "../../src/config/template.js";
import type { LabelSpec } from "../../src/config/labelSpec.js";
import type { PrinterProfile } from "../../src/config/printerProfile.js";
import { partNumberLabelTemplate } from "../../src/templates/partNumberLabelTemplate.js";

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

const template: Template = {
  schemaVersion: 1,
  name: "test template",
  fields: [
    { name: "part_name", type: "text", x_mm: 3, y_mm: 2, font: "0", height_mm: 3 },
    { name: "part_number", type: "text", x_mm: 3, y_mm: 7, font: "0", height_mm: 5.5 },
    {
      name: "barcode",
      type: "barcode",
      source: "part_number",
      x_mm: 3,
      y_mm: 14,
      height_mm: 7,
      moduleWidth_dots: 2,
      printText: false,
    },
    {
      name: "country",
      type: "text",
      text: "INDONESIA",
      x_mm: 19,
      y_mm: 26.5,
      font: "0",
      height_mm: 2.2,
    },
  ],
};

describe("renderZpl", () => {
  it("wraps the label in ^XA/^XZ with size, home offset, darkness, and speed derived from mm", () => {
    const buffer = renderZpl(label, printer, template, {
      part_name: "PANEL S/A RR DOOR LH",
      part_number: "67004-BZ660",
    });
    const zpl = buffer.toString("ascii");

    expect(zpl.startsWith("^XA\n")).toBe(true);
    expect(zpl.endsWith("\n^XZ")).toBe(true);
    expect(zpl).toContain("^PW400");
    expect(zpl).toContain("^LL240");
    expect(zpl).toContain("^LH16,16");
    expect(zpl).toContain("^MD15");
    expect(zpl).toContain("^PR4");
  });

  it("renders the barcode field using the resolved value of its source field", () => {
    const buffer = renderZpl(label, printer, template, {
      part_name: "PANEL S/A RR DOOR LH",
      part_number: "67004-BZ660",
    });
    const zpl = buffer.toString("ascii");

    expect(zpl).toContain("^FD67004-BZ660^FS");
    // part_number's text block and the barcode's ^FD should both carry the same value.
    expect(zpl.match(/\^FD67004-BZ660\^FS/g)).toHaveLength(2);
  });

  it("renders a static literal text field without needing job data for it", () => {
    const buffer = renderZpl(label, printer, template, {
      part_name: "PANEL S/A RR DOOR LH",
      part_number: "67004-BZ660",
    });
    expect(buffer.toString("ascii")).toContain("^FDINDONESIA^FS");
  });

  it("applies default darkness/speed when the label spec omits them", () => {
    const buffer = renderZpl(
      { ...label, darkness: undefined, speed_ips: undefined },
      printer,
      template,
      { part_name: "x", part_number: "y" },
    );
    const zpl = buffer.toString("ascii");
    expect(zpl).toContain("^MD15");
    expect(zpl).toContain("^PR4");
  });

  it("throws RenderError when required job data is missing", () => {
    expect(() => renderZpl(label, printer, template, { part_name: "x" })).toThrow(RenderError);
  });

  it("renders the real bundled part-number-label template against the real example files", () => {
    const realLabel = loadYaml("examples/labels/label-50x30.yaml", LabelSpecSchema);
    const realPrinter = loadYaml("examples/printers/zd220-cups.yaml", PrinterProfileSchema);
    const zpl = renderZpl(realLabel, realPrinter, partNumberLabelTemplate, {
      part_name: "PANEL S/A RR DOOR LH",
      part_number: "67004-BZ660",
      qty: "1",
    }).toString("ascii");

    expect(zpl).toContain("^FDPANEL S/A RR DOOR LH^FS");
    expect(zpl).toContain("^FD67004-BZ660^FS");
    expect(zpl).toContain("^FD1^FS");
    expect(zpl).toContain("^FDINDONESIA^FS");
    expect(zpl).toContain("^FD26H05^FS");
  });
});
