/**
 * Copy zedi-auth-db from packages/ into node_modules/ so that Terraform archive_file
 * can zip real files (on Windows, npm install file: creates a symlink that archive_file cannot read).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lambdaDir = path.resolve(__dirname, "..");
const src = path.resolve(lambdaDir, "../../../../packages/zedi-auth-db");
const dest = path.join(lambdaDir, "node_modules/zedi-auth-db");

if (!fs.existsSync(src)) {
  console.warn("[copy-zedi-auth-db] packages/zedi-auth-db not found, skip");
  process.exit(0);
}
try {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("[copy-zedi-auth-db] copied to node_modules/zedi-auth-db");
} catch (err) {
  console.error("[copy-zedi-auth-db]", err);
  process.exit(1);
}
