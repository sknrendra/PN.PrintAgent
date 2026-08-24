import { describe, expect, it } from "vitest";
import { renderBarcodeField } from "../../../src/render/zpl/fields/barcode.js";
import type { BarcodeField } from "../../../src/config/template.js";

const baseField: BarcodeField = {
  name: "barcode",
  type: "barcode",
  source: "part_number",
  x_mm: 3,
  y_mm: 14,
  height_mm: 7,
  moduleWidth_dots: 2,
  printText: false,
};

describe("renderBarcodeField", () => {
  it("emits ^FO/^BY/^BCN/^FD/^FS with mm converted to dots at 203dpi", () => {
    const zpl = renderBarcodeField(baseField, 203, "67004-BZ660");
    expect(zpl).toBe("^FO24,112\n^BY2\n^BCN,56,N,N,N\n^FD67004-BZ660^FS");
  });

  it("prints the human-readable interpretation line when printText is true", () => {
    const zpl = renderBarcodeField({ ...baseField, printText: true }, 203, "x");
    expect(zpl).toContain("^BCN,56,Y,N,N");
  });

  it("strips ZPL control characters from the encoded value", () => {
    const zpl = renderBarcodeField(baseField, 203, "a^b~c");
    expect(zpl).toContain("^FDabc^FS");
  });
});
