import { describe, expect, it } from "vitest";
import { renderTextField, resolveTextValue } from "../../../src/render/zpl/fields/text.js";
import { RenderError } from "../../../src/errors.js";
import type { TextField } from "../../../src/config/template.js";

const baseField: TextField = {
  name: "part_number",
  type: "text",
  x_mm: 3,
  y_mm: 7,
  font: "0",
  height_mm: 5.5,
};

describe("resolveTextValue", () => {
  it("prefers a static literal `text` over job data", () => {
    expect(resolveTextValue({ ...baseField, text: "INDONESIA" }, { part_number: "x" })).toBe(
      "INDONESIA",
    );
  });

  it("falls back to job data keyed by field name", () => {
    expect(resolveTextValue(baseField, { part_number: "67004-BZ660" })).toBe("67004-BZ660");
  });

  it("throws RenderError when neither a literal nor job data is present", () => {
    expect(() => resolveTextValue(baseField, {})).toThrow(RenderError);
  });

  it("throws RenderError when job data supplies an empty string", () => {
    expect(() => resolveTextValue(baseField, { part_number: "" })).toThrow(RenderError);
  });
});

describe("renderTextField", () => {
  it("emits ^FO/^A/^FD/^FS with mm converted to dots at 203dpi", () => {
    const zpl = renderTextField(baseField, 203, "67004-BZ660");
    expect(zpl).toBe("^FO24,56\n^A0N,44\n^FD67004-BZ660^FS");
  });

  it("includes an explicit field width in dots when width_mm is set", () => {
    const zpl = renderTextField({ ...baseField, width_mm: 20 }, 203, "x");
    expect(zpl).toContain("^A0N,44,160");
  });

  it("truncates to maxLength when set", () => {
    const zpl = renderTextField({ ...baseField, maxLength: 4 }, 203, "67004-BZ660");
    expect(zpl).toContain("^FD6700^FS");
  });

  it("strips ZPL control characters from the value", () => {
    const zpl = renderTextField(baseField, 203, "a^XAb~SDc");
    expect(zpl).toContain("^FDaXAbSDc^FS");
  });

  it("uses the field's font designator", () => {
    const zpl = renderTextField({ ...baseField, font: "D" }, 203, "x");
    expect(zpl).toContain("^ADN,44");
  });
});
