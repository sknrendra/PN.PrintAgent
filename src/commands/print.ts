import { readFileSync } from "node:fs";
import { LabelSpecSchema, type LabelSpec } from "../config/labelSpec.js";
import { loadYaml } from "../config/loadYaml.js";
import { PrinterProfileSchema, type PrinterProfile } from "../config/printerProfile.js";
import { TemplateSchema, type Template } from "../config/template.js";
import { ConfigError } from "../errors.js";
import { renderStripeZpl } from "../render/zpl/renderStripeZpl.js";
import { renderZpl, type PrintJobData } from "../render/zpl/renderZpl.js";
import { partNumberLabelTemplate } from "../templates/partNumberLabelTemplate.js";
import type { Transport } from "../transport/Transport.js";
import { createTransport } from "../transport/Transport.js";

export interface BatchOptions {
  stripe?: boolean;
}

export interface SendResult {
  jobsSent: number;
  stripeSent: boolean;
}

function renderBatchBuffers(
  label: LabelSpec,
  printer: PrinterProfile,
  template: Template,
  jobs: PrintJobData[],
  withStripe: boolean,
): Buffer[] {
  const zplJobs = jobs.map((data) => renderZpl(label, printer, template, data));
  const zplStripe = withStripe ? renderStripeZpl(label, printer) : null;
  return zplStripe ? [...zplJobs, zplStripe] : zplJobs;
}

/** Pure render, no transport involved -- used for dry-run previews. */
export function renderBatchZpl(
  label: LabelSpec,
  printer: PrinterProfile,
  template: Template,
  jobs: PrintJobData[],
  options: BatchOptions = {},
): string {
  const buffers = renderBatchBuffers(label, printer, template, jobs, options.stripe ?? true);
  return buffers.map((buf) => buf.toString("ascii")).join("\n\n") + "\n";
}

/**
 * Renders a batch of jobs (+ optional trailing stripe) and sends them to the printer as a
 * single spool job -- concatenating every `^XA...^XZ` block into one buffer/one
 * transport.send() call, so a whole batch can't be split apart by another caller's job landing
 * in the middle of it at the print queue. Takes an already-constructed Transport rather than
 * building one internally, so a caller serving many requests (the HTTP server) can build it
 * once and reuse it, instead of a fresh instance per call.
 */
export async function sendBatch(
  label: LabelSpec,
  printer: PrinterProfile,
  template: Template,
  jobs: PrintJobData[],
  transport: Transport,
  options: BatchOptions = {},
): Promise<SendResult> {
  const withStripe = options.stripe ?? true;
  const buffers = renderBatchBuffers(label, printer, template, jobs, withStripe);
  const combined = Buffer.from(buffers.map((buf) => buf.toString("ascii")).join("\n"), "ascii");

  await transport.send(combined);

  return { jobsSent: jobs.length, stripeSent: withStripe };
}

export interface PrintOptions {
  label: string;
  printer: string;
  data: string;
  template?: string;
  dryRun?: boolean;
  stripe?: boolean;
}

export interface PrintResult {
  /** Present only when dryRun was requested; nothing was sent. */
  zpl?: string;
  /** Present only when a real print happened. */
  jobsSent?: number;
  stripeSent?: boolean;
}

export async function runPrint(options: PrintOptions): Promise<PrintResult> {
  const label = loadYaml(options.label, LabelSpecSchema);
  const printer = loadYaml(options.printer, PrinterProfileSchema);
  const template = options.template
    ? loadYaml(options.template, TemplateSchema)
    : partNumberLabelTemplate;
  const jobs = loadJobDataBatch(options.data);

  if (options.dryRun) {
    return { zpl: renderBatchZpl(label, printer, template, jobs, { stripe: options.stripe }) };
  }

  const transport = createTransport(printer.transport);
  return sendBatch(label, printer, template, jobs, transport, { stripe: options.stripe });
}

export function parseJobDataBatch(raw: string, sourceLabel: string): PrintJobData[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not parse JSON in ${sourceLabel}: ${cause}`);
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length === 0) {
    throw new ConfigError(`Job data in ${sourceLabel} must contain at least one job`);
  }

  return records.map((record, index) => parseJobRecord(record, sourceLabel, index));
}

function loadJobDataBatch(filePath: string): PrintJobData[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not read job data file ${filePath}: ${cause}`);
  }
  return parseJobDataBatch(raw, filePath);
}

function parseJobRecord(record: unknown, sourceLabel: string, index: number): PrintJobData {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new ConfigError(
      `Job data entry ${index} in ${sourceLabel} must be a JSON object of field name -> value`,
    );
  }

  const data: PrintJobData = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") {
      throw new ConfigError(
        `Job data field "${key}" in entry ${index} of ${sourceLabel} must be a string, got ${typeof value}`,
      );
    }
    data[key] = value;
  }
  return data;
}
