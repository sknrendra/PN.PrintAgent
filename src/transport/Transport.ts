import type { TransportConfig } from "../config/printerProfile.js";
import { CupsTransport } from "./CupsTransport.js";
import { WindowsTransport } from "./WindowsTransport.js";

export interface Transport {
  send(buffer: Buffer): Promise<void>;
}

export function createTransport(config: TransportConfig): Transport {
  switch (config.type) {
    case "cups":
      return new CupsTransport(config);
    case "windows":
      return new WindowsTransport(config);
  }
}
