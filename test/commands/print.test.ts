import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderError } from "../../src/errors.js";

const sendMock = vi.hoisted(() => vi.fn(async () => {}));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ send: sendMock })));
vi.mock("../../src/transport/Transport.js", () => ({ createTransport: createTransportMock }));

const { runPrint } = await import("../../src/commands/print.js");

const LABEL_PATH = "examples/labels/label-50x30.yaml";
const PRINTER_PATH = "examples/printers/zd220-cups.yaml";

function sentZpl(): string {
  return (sendMock.mock.calls[0]?.[0] as Buffer).toString("ascii");
}

describe("runPrint", () => {
  let dir: string;

  beforeEach(() => {
    sendMock.mockClear();
    createTransportMock.mockClear();
    dir = mkdtempSync(join(tmpdir(), "printagent-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a single label plus a trailing stripe as one combined spool job", async () => {
    const dataPath = join(dir, "job.json");
    writeFileSync(
      dataPath,
      JSON.stringify({ part_name: "PANEL S/A RR DOOR LH", part_number: "67004-BZ660", qty: "1" }),
    );

    const result = await runPrint({ label: LABEL_PATH, printer: PRINTER_PATH, data: dataPath });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentZpl()).toContain("^FD67004-BZ660^FS");
    expect(sentZpl()).toContain("^GB");
    expect(result).toEqual({ jobsSent: 1, stripeSent: true });
  });

  it("sends every job in a batch array plus the trailing stripe as a single combined job", async () => {
    const dataPath = join(dir, "job-batch.json");
    writeFileSync(
      dataPath,
      JSON.stringify([
        { part_name: "A", part_number: "111", qty: "1" },
        { part_name: "B", part_number: "222", qty: "2" },
        { part_name: "C", part_number: "333", qty: "3" },
      ]),
    );

    const result = await runPrint({ label: LABEL_PATH, printer: PRINTER_PATH, data: dataPath });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const zpl = sentZpl();
    expect(zpl.indexOf("^FD111^FS")).toBeLessThan(zpl.indexOf("^FD222^FS"));
    expect(zpl.indexOf("^FD222^FS")).toBeLessThan(zpl.indexOf("^FD333^FS"));
    expect(zpl.indexOf("^FD333^FS")).toBeLessThan(zpl.indexOf("^GB"));
    expect(result).toEqual({ jobsSent: 3, stripeSent: true });
  });

  it("reports jobsSent for both a 5-job and a 1000-job batch, still as a single send() call each", async () => {
    const fiveDataPath = join(dir, "five.json");
    writeFileSync(
      fiveDataPath,
      JSON.stringify(
        Array.from({ length: 5 }, (_, i) => ({
          part_name: `P${i}`,
          part_number: `${i}`,
          qty: "1",
        })),
      ),
    );
    const fiveResult = await runPrint({ label: LABEL_PATH, printer: PRINTER_PATH, data: fiveDataPath });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(fiveResult).toEqual({ jobsSent: 5, stripeSent: true });

    sendMock.mockClear();
    const thousandDataPath = join(dir, "thousand.json");
    writeFileSync(
      thousandDataPath,
      JSON.stringify(
        Array.from({ length: 1000 }, (_, i) => ({
          part_name: `P${i}`,
          part_number: `${i}`,
          qty: "1",
        })),
      ),
    );
    const thousandResult = await runPrint({
      label: LABEL_PATH,
      printer: PRINTER_PATH,
      data: thousandDataPath,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(thousandResult).toEqual({ jobsSent: 1000, stripeSent: true });
  });

  it("omits the stripe when stripe: false is passed", async () => {
    const dataPath = join(dir, "job.json");
    writeFileSync(dataPath, JSON.stringify({ part_name: "A", part_number: "111", qty: "1" }));

    const result = await runPrint({
      label: LABEL_PATH,
      printer: PRINTER_PATH,
      data: dataPath,
      stripe: false,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentZpl()).not.toContain("^GB");
    expect(result).toEqual({ jobsSent: 1, stripeSent: false });
  });

  it("dry-run returns every job plus the stripe as rendered ZPL, without sending anything", async () => {
    const dataPath = join(dir, "job-batch.json");
    writeFileSync(
      dataPath,
      JSON.stringify([
        { part_name: "A", part_number: "111", qty: "1" },
        { part_name: "B", part_number: "222", qty: "2" },
      ]),
    );

    const result = await runPrint({
      label: LABEL_PATH,
      printer: PRINTER_PATH,
      data: dataPath,
      dryRun: true,
    });

    expect(sendMock).not.toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(result.zpl).toContain("^FD111^FS");
    expect(result.zpl).toContain("^FD222^FS");
    expect(result.zpl).toContain("^GB");
    expect(result.jobsSent).toBeUndefined();
  });

  it("throws RenderError before sending anything when a job in the batch is missing required data", async () => {
    const dataPath = join(dir, "bad-batch.json");
    writeFileSync(
      dataPath,
      JSON.stringify([
        { part_name: "A", part_number: "111", qty: "1" },
        { part_name: "B" }, // missing part_number/qty
      ]),
    );

    await expect(
      runPrint({ label: LABEL_PATH, printer: PRINTER_PATH, data: dataPath }),
    ).rejects.toThrow(RenderError);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
