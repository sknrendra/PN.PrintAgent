import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { ZodType, ZodTypeDef } from "zod";
import { ConfigError } from "../errors.js";

// The trailing `any` keeps zod's Input type param free so this infers correctly against
// schemas with `.default()` fields, where Input and Output legitimately differ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadYaml<T>(filePath: string, schema: ZodType<T, ZodTypeDef, any>): T {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not read ${filePath}: ${cause}`);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not parse YAML in ${filePath}: ${cause}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config in ${filePath}:\n${issues}`);
  }

  return result.data;
}
