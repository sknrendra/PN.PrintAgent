import { spawn } from "node:child_process";
import type { CupsTransportConfig } from "../config/printerProfile.js";
import { TransportError } from "../errors.js";
import type { Transport } from "./Transport.js";

export class CupsTransport implements Transport {
  constructor(private readonly config: CupsTransportConfig) {}

  async send(buffer: Buffer): Promise<void> {
    const { queue, copies, timeout_ms } = this.config;

    await new Promise<void>((resolve, reject) => {
      // `-o raw` is required so CUPS passes the ZPL bytes straight to the printer's
      // ZPL-speaking backend instead of trying to reinterpret them as a document format.
      const child = spawn("lp", ["-d", queue, "-o", "raw", "-n", String(copies)]);
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new TransportError(`Timed out sending to CUPS queue "${queue}" after ${timeout_ms}ms`),
        );
      }, timeout_ms);

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new TransportError(`Failed to spawn "lp" for CUPS queue "${queue}": ${err.message}`));
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new TransportError(`"lp -d ${queue}" exited with code ${code}: ${stderr.trim()}`),
          );
        }
      });

      child.stdin.write(buffer);
      child.stdin.end();
    });
  }
}
