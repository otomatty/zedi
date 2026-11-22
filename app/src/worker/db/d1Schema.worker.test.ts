import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { readD1Schema } from "./d1Schema";

it("includes virtual and stored generated columns in the D1 schema", async () => {
  try {
    await env.DB.prepare(
      `CREATE TABLE parity_generated_probe (
        a INTEGER,
        b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL,
        c INTEGER GENERATED ALWAYS AS (a + 1) STORED
      )`,
    ).run();

    const tables = await readD1Schema(env.DB);
    const probe = tables.find(({ name }) => name === "parity_generated_probe");
    expect(probe?.columns.map(({ name }) => name)).toEqual(["a", "b", "c"]);
  } finally {
    await env.DB.prepare("DROP TABLE IF EXISTS parity_generated_probe").run();
  }
});
