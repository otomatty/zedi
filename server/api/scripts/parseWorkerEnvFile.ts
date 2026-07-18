/** One secret name/value pair parsed from a Worker env file. / Worker env ファイルから解析した secret の name/value ペア。 */
export type WorkerSecretEntry = { name: string; value: string };

/**
 * Parses a dotenv-style Worker secrets file into name/value pairs.
 * Skips blank lines, `#` comments, and empty values. Supports optional `export` prefix
 * and single/double-quoted values. Rejects lines without a valid `KEY=VALUE` pair.
 *
 * dotenv 形式の Worker secrets ファイルを name/value ペアに解析する。
 * 空行・`#` コメント・空値はスキップ。`export` 接頭辞と単/二重引用符付き値に対応。
 * 不正な行（`KEY=VALUE` でない行）は拒否する。
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

/**
 * Serializes parsed entries to `.env` lines for `wrangler secret bulk`.
 * Values containing whitespace or `=` are double-quoted.
 *
 * 解析済みエントリを `wrangler secret bulk` 向けの `.env` 行に直列化する。
 * 空白または `=` を含む値は二重引用符で囲む。
 */
export function serializeWorkerEnvFile(entries: WorkerSecretEntry[]): string {
  return entries
    .map(({ name, value }) => {
      const needsQuotes = /[\s=#"]/.test(value);
      const serialized = needsQuotes
        ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
        : value;
      return `${name}=${serialized}`;
    })
    .join("\n");
}
