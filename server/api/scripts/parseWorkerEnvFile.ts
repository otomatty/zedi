export type WorkerSecretEntry = { name: string; value: string };

/**
 * Parses a dotenv-style Worker secrets file into name/value pairs.
 * Skips blank lines, `#` comments, and empty values. Supports optional `export` prefix
 * and single/double-quoted values.
 */
export function parseWorkerEnvFile(text: string): WorkerSecretEntry[] {
  const entries: WorkerSecretEntry[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid worker env line (expected KEY=VALUE): ${rawLine}`);
    }

    const name = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid worker env line (expected KEY=VALUE): ${rawLine}`);
    }

    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value === "") continue;
    entries.push({ name, value });
  }

  return entries;
}
