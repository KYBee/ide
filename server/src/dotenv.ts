import fs from "node:fs";
import path from "node:path";

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) return undefined;

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function envPaths(): string[] {
  const configured = process.env.SESSION_CONTROL_ENV_FILE;
  if (configured) return [configured];

  return [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env")
  ];
}

export function loadDotEnv(): void {
  for (const envPath of envPaths()) {
    if (!fs.existsSync(envPath)) continue;

    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      process.env[key] ??= value;
    }
  }
}
