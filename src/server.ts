import { timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseJobDataBatch, renderBatchZpl, sendBatch } from "./commands/print.js";
import { LabelSpecSchema, type LabelSpec } from "./config/labelSpec.js";
import { loadYaml } from "./config/loadYaml.js";
import { PrinterProfileSchema, type PrinterProfile } from "./config/printerProfile.js";
import { TemplateSchema, type Template } from "./config/template.js";
import { ConfigError, RenderError, TransportError } from "./errors.js";
import { partNumberLabelTemplate } from "./templates/partNumberLabelTemplate.js";
import type { Transport } from "./transport/Transport.js";
import { createTransport } from "./transport/Transport.js";

const MAX_BODY_BYTES = 1024 * 1024; // 1MB -- this endpoint is meant to be reachable from the internet

export interface ServerOptions {
  label: string;
  printer: string;
  template?: string;
  printKey: string;
}

interface HandlerContext {
  label: LabelSpec;
  printer: PrinterProfile;
  template: Template;
  transport: Transport;
  printKey: string;
  serialize: <T>(fn: () => Promise<T>) => Promise<T>;
}

export function createServer(options: ServerOptions) {
  const label = loadYaml(options.label, LabelSpecSchema);
  const printer = loadYaml(options.printer, PrinterProfileSchema);
  const template = options.template
    ? loadYaml(options.template, TemplateSchema)
    : partNumberLabelTemplate;
  // Built once here and reused for every request -- see sendBatch's doc comment for why it
  // takes an already-constructed Transport rather than building one per call.
  const transport = createTransport(printer.transport);

  // Serializes real (non-dry-run) sends so two concurrent requests can never interleave their
  // transport.send() calls -- combined with sendBatch sending a whole batch as one buffer, this
  // makes each HTTP-triggered batch fully atomic at the printer regardless of request timing.
  let sendQueue: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = sendQueue.then(fn, fn);
    sendQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  const ctx: HandlerContext = {
    label,
    printer,
    template,
    transport,
    printKey: options.printKey,
    serialize,
  };

  return createHttpServer((req, res) => {
    handleRequest(req, res, ctx).catch((err) => {
      console.error("Unhandled error in request handler:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: "internal error" }));
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HandlerContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method !== "POST" || url.pathname !== "/print") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  if (!isAuthorized(req, ctx.printKey)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  let body: string;
  try {
    body = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const dryRun = isTruthyParam(url.searchParams.get("dryRun"));
  const stripeParam = url.searchParams.get("stripe");
  const stripe = stripeParam === null ? undefined : isTruthyParam(stripeParam);

  try {
    const jobs = parseJobDataBatch(body, "request body");
    const result = dryRun
      ? { zpl: renderBatchZpl(ctx.label, ctx.printer, ctx.template, jobs, { stripe }) }
      : await ctx.serialize(() =>
          sendBatch(ctx.label, ctx.printer, ctx.template, jobs, ctx.transport, { stripe }),
        );
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    if (err instanceof ConfigError || err instanceof RenderError) {
      sendJson(res, 400, { error: err.message });
    } else if (err instanceof TransportError) {
      sendJson(res, 502, { error: err.message });
    } else {
      throw err;
    }
  }
}

function isAuthorized(req: IncomingMessage, printKey: string): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;

  const token = header.slice("Bearer ".length);
  const expected = Buffer.from(printKey, "utf8");
  const actual = Buffer.from(token, "utf8");
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

function isTruthyParam(value: string | null): boolean {
  return value === "true" || value === "1";
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
