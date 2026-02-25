/// <reference types="bun-types" />
/**
 * Load .env style file into process.env.
 * Handles KEY=VALUE, empty lines, and # comments.
 */
export async function loadEnvFile(filePath: string): Promise<boolean> {
  const content = Bun.file(filePath);
  if (!(await content.exists())) return false;
  const text = await content.text();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
  return true;
}
