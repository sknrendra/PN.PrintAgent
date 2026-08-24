#!/usr/bin/env node
import { Command } from "commander";
import { runPrint } from "./commands/print.js";
import { ConfigError, RenderError, TransportError } from "./errors.js";
import { createServer } from "./server.js";

const program = new Command();

program
  .name("printagent")
  .description("Print part-number labels to ZPL-compatible printers")
  .version("0.1.0");

program
  .command("print")
  .description("Render the part-number label(s) and send them to a printer")
  .requiredOption("--label <file>", "path to the LabelSpec YAML file")
  .requiredOption("--printer <file>", "path to the PrinterProfile YAML file")
  .requiredOption(
    "--data <file>",
    "path to the job data JSON file (a single object, or an array to batch-print)",
  )
  .option("--template <file>", "override the bundled part-number-label template")
  .option("--dry-run", "render ZPL to stdout instead of sending it to the printer", false)
  .option("--no-stripe", "don't print the trailing separator stripe after the batch")
  .action(async (opts: {
    label: string;
    printer: string;
    data: string;
    template?: string;
    dryRun?: boolean;
    stripe?: boolean;
  }) => {
    try {
      const result = await runPrint(opts);
      if (result.zpl !== undefined) {
        process.stdout.write(result.zpl);
      }
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error(`Config error: ${err.message}`);
        process.exitCode = 2;
      } else if (err instanceof RenderError) {
        console.error(`Render error: ${err.message}`);
        process.exitCode = 3;
      } else if (err instanceof TransportError) {
        console.error(`Transport error: ${err.message}`);
        process.exitCode = 4;
      } else {
        throw err;
      }
    }
  });

program
  .command("serve")
  .description("Run an HTTP server accepting print jobs, protected by a PRINT_KEY bearer token")
  .requiredOption("--label <file>", "path to the LabelSpec YAML file")
  .requiredOption("--printer <file>", "path to the PrinterProfile YAML file")
  .option("--template <file>", "override the bundled part-number-label template")
  .option("--port <n>", "port to listen on", "3000")
  .action((opts: { label: string; printer: string; template?: string; port: string }) => {
    try {
      process.loadEnvFile(".env");
    } catch {
      // No .env file present -- PRINT_KEY may already be set directly in the environment.
    }

    const printKey = process.env.PRINT_KEY;
    if (!printKey) {
      console.error(
        "PRINT_KEY is not set (checked .env and the environment) -- refusing to start unauthenticated.",
      );
      process.exitCode = 2;
      return;
    }

    const port = Number(opts.port);

    try {
      const server = createServer({
        label: opts.label,
        printer: opts.printer,
        template: opts.template,
        printKey,
      });
      server.listen(port, () => {
        console.log(`printagent listening on :${port}`);
      });
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error(`Config error: ${err.message}`);
        process.exitCode = 2;
      } else {
        throw err;
      }
    }
  });

program.parse(process.argv);
