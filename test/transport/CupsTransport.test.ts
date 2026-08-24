import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CupsTransport } from "../../src/transport/CupsTransport.js";
import { TransportError } from "../../src/errors.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

class FakeChildProcess extends EventEmitter {
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn() };
  kill = vi.fn();
}

describe("CupsTransport", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("spawns lp with -d <queue> -o raw and writes the buffer to stdin", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double, only the parts CupsTransport actually uses are implemented
    spawnMock.mockReturnValue(child);

    const transport = new CupsTransport({
      type: "cups",
      queue: "ZTC-ZD220-203dpi-ZPL",
      copies: 1,
      timeout_ms: 15000,
    });
    const sendPromise = transport.send(Buffer.from("^XA^XZ"));

    expect(spawnMock).toHaveBeenCalledWith("lp", [
      "-d",
      "ZTC-ZD220-203dpi-ZPL",
      "-o",
      "raw",
      "-n",
      "1",
    ]);
    expect(child.stdin.write).toHaveBeenCalledWith(Buffer.from("^XA^XZ"));
    expect(child.stdin.end).toHaveBeenCalled();

    child.emit("close", 0);
    await expect(sendPromise).resolves.toBeUndefined();
  });

  it("rejects with TransportError, including captured stderr, when lp exits non-zero", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double
    spawnMock.mockReturnValue(child);

    const transport = new CupsTransport({ type: "cups", queue: "Q", copies: 1, timeout_ms: 15000 });
    const sendPromise = transport.send(Buffer.from("x"));

    child.stderr.emit("data", Buffer.from("printer offline"));
    child.emit("close", 1);

    await expect(sendPromise).rejects.toThrow(TransportError);
    await expect(sendPromise).rejects.toThrow(/printer offline/);
  });

  it("rejects with TransportError when spawning lp itself fails", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double
    spawnMock.mockReturnValue(child);

    const transport = new CupsTransport({ type: "cups", queue: "Q", copies: 1, timeout_ms: 15000 });
    const sendPromise = transport.send(Buffer.from("x"));

    child.emit("error", new Error("ENOENT: lp not found"));

    await expect(sendPromise).rejects.toThrow(TransportError);
  });
});
