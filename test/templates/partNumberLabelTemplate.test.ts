import { describe, expect, it } from "vitest";
import { partNumberLabelTemplate } from "../../src/templates/partNumberLabelTemplate.js";

describe("partNumberLabelTemplate", () => {
  it("has the 6 expected fields, already validated at module load via TemplateSchema.parse", () => {
    expect(partNumberLabelTemplate.fields).toHaveLength(6);
    const barcode = partNumberLabelTemplate.fields.find((f) => f.type === "barcode");
    expect(barcode).toMatchObject({ source: "part_number" });
  });

  it("has the tuned qty height (4.5mm) and country/lot_code as static literals", () => {
    const qty = partNumberLabelTemplate.fields.find((f) => f.name === "qty");
    expect(qty).toMatchObject({ type: "text", height_mm: 4.5 });

    const country = partNumberLabelTemplate.fields.find((f) => f.name === "country");
    expect(country).toMatchObject({ type: "text", text: "INDONESIA" });

    const lotCode = partNumberLabelTemplate.fields.find((f) => f.name === "lot_code");
    expect(lotCode).toMatchObject({ type: "text", text: "26H05" });
  });
});
