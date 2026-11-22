import {
  normalizeSqliteTable,
  parseCheckEnums,
  type ForeignKeyShape,
  type IndexShape,
  type SchemaShape,
  type TableShape,
} from "./schemaParity";

/**
 * FTS5 virtual table present only in SQL, so schema comparison skips it. Shadow tables start with `pages_fts_`.
 * FTS5 の仮想表は SQL にだけあり Drizzle に無いので比較から外す。影の表は `pages_fts_` で始まる。
 */
export const PAGES_FTS_TABLE = "pages_fts";

/** D1 migration bookkeeping. It is not an application table. */
const D1_MIGRATIONS_TABLE = "d1_migrations";

interface TableInfoRow {
  name: string;
  type: string;
  not_null: number;
  dflt_value: string | number | null;
  pk: number;
}

interface IndexListRow {
  name: string;
  is_unique: number;
  origin: string;
  partial: number;
}

interface IndexColumnRow {
  name: string | null;
  is_desc: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  foreign_table: string;
  local_column: string;
  foreign_column: string;
  on_update: string;
  on_delete: string;
}

/**
 * Reads applied D1 tables into the same shape as `describeDrizzleSchema`.
 * 適用済みの D1 の表を、`describeDrizzleSchema` と同じ形で読む。
 */
export async function readD1Schema(db: D1Database): Promise<SchemaShape> {
  const master = await queryAll<{ name: string; sql: string | null }>(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type = 'table'",
  );
  const tables: TableShape[] = [];
  for (const row of master) {
    if (isSkippedTable(row.name)) continue;
    tables.push(normalizeSqliteTable(await readTable(db, row.name, row.sql ?? "")));
  }
  return tables.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Skips SQLite, D1, and FTS shadow tables. Any other SQL-only table stays visible as a difference.
 * SQLite・D1・FTS の影の表を外す。それ以外で SQL にしか無い表は差分として残す。
 */
function isSkippedTable(name: string): boolean {
  return (
    name.startsWith("sqlite_") ||
    name.startsWith("_cf_") ||
    name === D1_MIGRATIONS_TABLE ||
    name === PAGES_FTS_TABLE ||
    name.startsWith(`${PAGES_FTS_TABLE}_`)
  );
}

async function readTable(db: D1Database, name: string, createSql: string): Promise<TableShape> {
  const enums = parseCheckEnums(createSql);
  const info = await queryAll<TableInfoRow>(
    db,
    'SELECT name, type, "notnull" AS not_null, dflt_value, pk FROM pragma_table_info(?)',
    name,
  );
  const columns = info
    .map((column) => ({
      name: column.name,
      type: column.type.toLowerCase(),
      notNull: column.not_null === 1,
      default: formatDefaultValue(column.dflt_value),
      enumValues: enums.get(column.name) ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const primaryKey = info
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  const { uniques, indexes } = await readUniquesAndIndexes(db, name);
  return {
    name,
    columns,
    primaryKey,
    uniques,
    foreignKeys: await readForeignKeys(db, name),
    indexes,
  };
}

async function readUniquesAndIndexes(
  db: D1Database,
  table: string,
): Promise<{ uniques: string[][]; indexes: IndexShape[] }> {
  const listed = await queryAll<IndexListRow>(
    db,
    'SELECT name, "unique" AS is_unique, origin, partial FROM pragma_index_list(?)',
    table,
  );
  const uniques: string[][] = [];
  const indexes: IndexShape[] = [];
  for (const index of listed) {
    if (index.origin === "pk") continue;
    const columns = await readIndexColumns(db, index.name);
    if (index.origin === "u") {
      uniques.push(
        columns.map((column) => column.name).sort((left, right) => left.localeCompare(right)),
      );
      continue;
    }
    if (index.origin !== "c") continue;
    indexes.push({
      name: index.name,
      unique: index.is_unique === 1,
      partial: index.partial === 1,
      columns,
    });
  }
  uniques.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
  indexes.sort((left, right) => left.name.localeCompare(right.name));
  return { uniques, indexes };
}

async function readIndexColumns(
  db: D1Database,
  indexName: string,
): Promise<{ name: string; desc: boolean }[]> {
  const rows = await queryAll<IndexColumnRow>(
    db,
    'SELECT name, "desc" AS is_desc FROM pragma_index_xinfo(?) WHERE "key" = 1 ORDER BY seqno',
    indexName,
  );
  return rows.map((row) => {
    if (row.name === null) {
      throw new Error(`Cannot read expression column of index "${indexName}"`);
    }
    return { name: row.name, desc: row.is_desc === 1 };
  });
}

async function readForeignKeys(db: D1Database, table: string): Promise<ForeignKeyShape[]> {
  const rows = await queryAll<ForeignKeyRow>(
    db,
    `SELECT id, seq, "table" AS foreign_table, "from" AS local_column, "to" AS foreign_column,
            on_update, on_delete
     FROM pragma_foreign_key_list(?)
     ORDER BY id, seq`,
    table,
  );
  const groups = new Map<number, ForeignKeyRow[]>();
  for (const row of rows) {
    const group = groups.get(row.id) ?? [];
    group.push(row);
    groups.set(row.id, group);
  }
  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      if (!first) return null;
      return {
        columns: group.map((row) => row.local_column),
        foreignTable: first.foreign_table,
        foreignColumns: group.map((row) => row.foreign_column),
        onDelete: first.on_delete,
        onUpdate: first.on_update,
      };
    })
    .filter((fk): fk is ForeignKeyShape => fk !== null)
    .sort((left, right) => foreignKeySortKey(left).localeCompare(foreignKeySortKey(right)));
}

function foreignKeySortKey(fk: ForeignKeyShape): string {
  return `${fk.columns.join("\0")}\0${fk.foreignTable}`;
}

function formatDefaultValue(value: string | number | null): string | null {
  if (typeof value === "number") return String(value);
  return value;
}

async function queryAll<T>(db: D1Database, sql: string, bind?: string): Promise<T[]> {
  const statement = bind === undefined ? db.prepare(sql) : db.prepare(sql).bind(bind);
  const { results } = await statement.all<T>();
  return results;
}
