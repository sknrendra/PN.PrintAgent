import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WindowsTransportConfig } from "../config/printerProfile.js";
import { TransportError } from "../errors.js";
import type { Transport } from "./Transport.js";

export class WindowsTransport implements Transport {
  constructor(private readonly config: WindowsTransportConfig) {}

  async send(buffer: Buffer): Promise<void> {
    const { share, timeout_ms } = this.config;
    const tempFile = join(tmpdir(), `printagent-${randomUUID()}.zpl`);
    await writeFile(tempFile, buffer);

    try {
      await copyToShare(tempFile, share, timeout_ms);
    } finally {
      await rm(tempFile, { force: true });
    }
  }
}

function copyToShare(tempFile: string, share: string, timeout_ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // `copy /b` spools the file to the printer's Windows queue as raw bytes, bypassing
    // GDI/driver rasterization -- the standard way to feed raw ZPL through a Windows print
    // share without a native winspool.drv (WritePrinter) binding.
    const child = spawn("cmd.exe", ["/c", "copy", "/b", tempFile, share]);
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new TransportError(`Timed out sending to Windows printer share "${share}" after ${timeout_ms}ms`),
      );
    }, timeout_ms);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new TransportError(`Failed to spawn "cmd.exe" for printer share "${share}": ${err.message}`),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new TransportError(`"copy /b" to "${share}" exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
