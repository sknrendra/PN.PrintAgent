import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WindowsTransport } from "../../src/transport/WindowsTransport.js";
import { TransportError } from "../../src/errors.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

class FakeChildProcess extends EventEmitter {
  stderr = new EventEmitter();
  kill = vi.fn();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("WindowsTransport", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("spools the buffer via `cmd.exe /c copy /b <tempfile> <share>` and cleans up the temp file", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double, only the parts WindowsTransport actually uses are implemented
    spawnMock.mockReturnValue(child);

    const transport = new WindowsTransport({
      type: "windows",
      share: "\\\\localhost\\ZD220",
      timeout_ms: 15000,
    });
    const sendPromise = transport.send(Buffer.from("^XA^XZ"));

    // Let the temp-file write (awaited before spawn) settle.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(command).toBe("cmd.exe");
    expect(args.slice(0, 3)).toEqual(["/c", "copy", "/b"]);
    const tempFile = args[3] as string;
    expect(tempFile.startsWith(tmpdir())).toBe(true);
    expect(tempFile).toContain("printagent-");
    expect(args[4]).toBe("\\\\localhost\\ZD220");
    expect(await fileExists(tempFile)).toBe(true);

    child.emit("close", 0);
    await expect(sendPromise).resolves.toBeUndefined();
    expect(await fileExists(tempFile)).toBe(false);
  });

  it("rejects with TransportError, including stderr, when copy exits non-zero, and still cleans up", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double
    spawnMock.mockReturnValue(child);

    const transport = new WindowsTransport({
      type: "windows",
      share: "\\\\localhost\\ZD220",
      timeout_ms: 15000,
    });
    const sendPromise = transport.send(Buffer.from("x"));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    const tempFile = (spawnMock.mock.calls[0] as [string, string[]])[1][3] as string;

    child.stderr.emit("data", Buffer.from("access denied"));
    child.emit("close", 1);

    await expect(sendPromise).rejects.toThrow(TransportError);
    await expect(sendPromise).rejects.toThrow(/access denied/);
    expect(await fileExists(tempFile)).toBe(false);
  });

  it("rejects with TransportError when spawning cmd.exe itself fails", async () => {
    const child = new FakeChildProcess();
    // @ts-expect-error -- test double
    spawnMock.mockReturnValue(child);

    const transport = new WindowsTransport({
      type: "windows",
      share: "\\\\localhost\\ZD220",
      timeout_ms: 15000,
    });
    const sendPromise = transport.send(Buffer.from("x"));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

    child.emit("error", new Error("spawn cmd.exe ENOENT"));

    await expect(sendPromise).rejects.toThrow(TransportError);
  });
});
