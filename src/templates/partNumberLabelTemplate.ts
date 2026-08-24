import { TemplateSchema, type Template } from "../config/template.js";

// The default part-number label layout, tuned against real prints on the ZD220 (50x30mm @
// 203dpi). Embedded as a TS object rather than a YAML file read from disk at runtime: a
// filesystem-based default template doesn't survive being bundled into a single-file executable
// (see the WindowsTransport/Bun packaging work) -- a plain module-load-time object works
// identically under tsc, Bun, or any future bundler with no special-case code. Custom layouts are
// still supported via `--template <file>`, which loads YAML from disk exactly as before.
export const partNumberLabelTemplate: Template = TemplateSchema.parse({
  schemaVersion: 1,
  name: "part-number-label",
  fields: [
    {
      name: "part_name",
      type: "text",
      x_mm: 3,
      y_mm: 2,
      height_mm: 3,
    },
    {
      name: "part_number",
      type: "text",
      x_mm: 3,
      y_mm: 6,
      height_mm: 5,
    },
    {
      name: "barcode",
      type: "barcode",
      source: "part_number",
      x_mm: 3,
      y_mm: 12,
      height_mm: 6.5,
      moduleWidth_dots: 2,
      printText: false,
    },
    {
      name: "qty",
      type: "text",
      x_mm: 20,
      y_mm: 20,
      height_mm: 4.5,
    },
    {
      name: "country",
      type: "text",
      text: "INDONESIA",
      x_mm: 19,
      y_mm: 25.5,
      height_mm: 2.2,
    },
    {
      name: "lot_code",
      type: "text",
      text: "26H05",
      x_mm: 37,
      y_mm: 25.5,
      height_mm: 2.2,
    },
  ],
});
