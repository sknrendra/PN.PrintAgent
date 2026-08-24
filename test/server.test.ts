import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn(async () => {}));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ send: sendMock })));
vi.mock("../src/transport/Transport.js", () => ({ createTransport: createTransportMock }));

const { createServer } = await import("../src/server.js");

const LABEL_PATH = "examples/labels/label-50x30.yaml";
const PRINTER_PATH = "examples/printers/zd220-cups.yaml";
const PRINT_KEY = "test-secret-key";

const JOB = { part_name: "PANEL S/A RR DOOR LH", part_number: "67004-BZ660", qty: "1" };

describe("server", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeEach(async () => {
    sendMock.mockClear();
    createTransportMock.mockClear();
    sendMock.mockImplementation(async () => {});

    server = createServer({ label: LABEL_PATH, printer: PRINTER_PATH, printKey: PRINT_KEY });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.restoreAllMocks();
  });

  it("builds the transport exactly once at server startup, not per-request", async () => {
    await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: JSON.stringify(JOB),
    });
    await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: JSON.stringify(JOB),
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a valid bearer token and returns jobsSent/stripeSent", async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: JSON.stringify(JOB),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, jobsSent: 1, stripeSent: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing Authorization header with 401", async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: "POST",
      body: JSON.stringify(JOB),
    });

    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token with 401", async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-key" },
      body: JSON.stringify(JOB),
    });

    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: "{not valid json",
    });

    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 404 for anything other than POST /print", async () => {
    const res = await fetch(`${baseUrl}/other`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: JSON.stringify(JOB),
    });
    expect(res.status).toBe(404);
  });

  it("?dryRun=true renders ZPL in the response without sending anything", async () => {
    const res = await fetch(`${baseUrl}/print?dryRun=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${PRINT_KEY}` },
      body: JSON.stringify(JOB),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.zpl).toContain("^FD67004-BZ660^FS");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("serializes concurrent real sends so they never overlap", async () => {
    const events: string[] = [];
    sendMock.mockImplementation(async () => {
      events.push("start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      events.push("end");
    });

    const post = () =>
      fetch(`${baseUrl}/print`, {
        method: "POST",
        headers: { authorization: `Bearer ${PRINT_KEY}` },
        body: JSON.stringify(JOB),
      });

    const [res1, res2] = await Promise.all([post(), post()]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
    // If the two sends had overlapped, events would read [start, start, end, end].
    // Serialized, the second send only starts after the first fully ends.
    expect(events).toEqual(["start", "end", "start", "end"]);
  });
});
