import { getTableName, is, SQL } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect, type SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Column shape compared between Drizzle and SQL.
 * Drizzle と SQL の間で比べる列の形。
 */
export type ColumnShape = {
  name: string;
  /** Lowercase SQL type. `timestamp_ms` and `boolean` are both `integer`. */
  type: string;
  notNull: boolean;
  default: string | null;
  /** Sorted CHECK IN values, or null when the column has no string enum. */
  enumValues: string[] | null;
};

/**
 * Foreign key shape compared between Drizzle and SQL.
 * Drizzle と SQL の間で比べる外部キーの形。
 */
export type ForeignKeyShape = {
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  /** Uppercase action. An omitted action is `NO ACTION`. */
  onDelete: string;
  /** Uppercase action. An omitted action is `NO ACTION`. */
  onUpdate: string;
};

/**
 * Index shape compared between Drizzle and SQL.
 * Drizzle と SQL の間で比べる索引の形。
 */
export type IndexShape = {
  name: string;
  unique: boolean;
  /** True when the index has a WHERE clause. The predicate text is not compared. */
  partial: boolean;
  columns: { name: string; desc: boolean }[];
};

/**
 * Table shape compared between Drizzle and SQL.
 * Drizzle と SQL の間で比べる表の形。
 */
export type TableShape = {
  name: string;
  /** Columns sorted by name. */
  columns: ColumnShape[];
  /** Primary key column names in key order, not sorted. */
  primaryKey: string[];
  /** Each entry's column names are sorted, and the list itself is sorted. */
  uniques: string[][];
  foreignKeys: ForeignKeyShape[];
  /** Indexes sorted by name. */
  indexes: IndexShape[];
};

/**
 * Whole schema. Tables are sorted by name.
 * スキーマ全体。表は名前順。
 */
export type SchemaShape = TableShape[];

const dialect = new SQLiteSyncDialect();

const columnFields = ["type", "notNull", "default", "enumValues"] as const;

type ColumnField = (typeof columnFields)[number];

/**
 * Reads Drizzle SQLite tables into a shape that can be compared with SQL.
 * Drizzle の SQLite 表を、SQL と比べられる形に読む。
 */
export function describeDrizzleSchema(tables: SQLiteTable[]): SchemaShape {
  return tables.map(describeTable).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Legacy SQLite can allow NULL in a non-INTEGER single-column primary key.
 * The app always supplies a value, so the comparison treats that column as NOT NULL.
 * SQLite の旧来の仕様では、INTEGER 以外の単一列の主キーが NULL を許す場合がある。
 * アプリは常に値を入れるので、この比較ではその列を NOT NULL として扱う。
 */
export function normalizeSqliteTable(table: TableShape): TableShape {
  if (table.primaryKey.length !== 1) return table;
  const [primaryKey] = table.primaryKey;
  return {
    ...table,
    columns: table.columns.map((column) =>
      column.name === primaryKey ? { ...column, notNull: true } : column,
    ),
  };
}

/**
 * Lists one line per difference between a Drizzle shape and a SQL shape.
 * Drizzle 側と SQL 側の形の差を、1 件 1 行で返す。差がなければ空配列。
 */
export function diffSchemas(drizzle: SchemaShape, sql: SchemaShape): string[] {
  const lines: string[] = [];
  const drizzleByName = new Map(drizzle.map((table) => [table.name, table]));
  const sqlByName = new Map(sql.map((table) => [table.name, table]));
  const names = [...new Set([...drizzleByName.keys(), ...sqlByName.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const name of names) {
    const left = drizzleByName.get(name);
    const right = sqlByName.get(name);
    if (!left) {
      lines.push(`${name}: table is in SQL but not in Drizzle`);
      continue;
    }
    if (!right) {
      lines.push(`${name}: table is in Drizzle but not in SQL`);
      continue;
    }
    lines.push(...diffTable(left, right));
  }
  return lines;
}

/**
 * Reads string CHECK IN lists from a CREATE TABLE statement and intersects the lists for each column.
 * CREATE TABLE 文の文字列 CHECK IN を読み、列ごとに値の積集合を取って並べ替える。
 */
export function parseCheckEnums(createTableSql: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const checkRe = /check\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = checkRe.exec(createTableSql)) !== null) {
    const openIndex = match.index + match[0].length - 1;
    const body = balancedInner(createTableSql, openIndex);
    if (body === null) break;
    const parsed = parseStringInCheck(body);
    if (parsed) {
      const previous = result.get(parsed.name);
      const values = previous
        ? [...new Set(previous)].filter((value) => parsed.values.includes(value))
        : parsed.values;
      result.set(parsed.name, values);
    }
    checkRe.lastIndex = openIndex + body.length + 2;
  }
  return result;
}

function describeTable(table: SQLiteTable): TableShape {
  const config = getTableConfig(table);
  const columns = config.columns
    .map((column) => ({
      name: column.name,
      type: column.getSQLType().toLowerCase(),
      notNull: column.notNull,
      default: formatDefault(column.default),
      enumValues: columnEnumValues(column.enumValues),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: config.name,
    columns,
    primaryKey: primaryKeyNames(config),
    uniques: uniqueColumnSets(config),
    foreignKeys: config.foreignKeys
      .map(describeForeignKey)
      .sort((a, b) => fkSortKey(a).localeCompare(fkSortKey(b))),
    indexes: config.indexes
      .map((entry) => ({
        name: entry.config.name,
        unique: entry.config.unique,
        partial: entry.config.where !== undefined,
        columns: describeIndexColumns(entry.config.name, entry.config.columns),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function primaryKeyNames(config: ReturnType<typeof getTableConfig>): string[] {
  const names: string[] = [];
  for (const column of config.columns) {
    if (column.primary) names.push(column.name);
  }
  for (const key of config.primaryKeys) {
    for (const column of key.columns) {
      if (!names.includes(column.name)) names.push(column.name);
    }
  }
  return names;
}

function uniqueColumnSets(config: ReturnType<typeof getTableConfig>): string[][] {
  const uniques: string[][] = [];
  for (const column of config.columns) {
    if (column.isUnique) uniques.push([column.name]);
  }
  for (const constraint of config.uniqueConstraints) {
    uniques.push(
      constraint.columns.map((column) => column.name).sort((a, b) => a.localeCompare(b)),
    );
  }
  return uniques.sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
}

function describeForeignKey(
  fk: ReturnType<typeof getTableConfig>["foreignKeys"][number],
): ForeignKeyShape {
  const ref = fk.reference();
  return {
    columns: ref.columns.map((column) => column.name),
    foreignTable: getTableName(ref.foreignTable),
    foreignColumns: ref.foreignColumns.map((column) => column.name),
    onDelete: actionName(fk.onDelete),
    onUpdate: actionName(fk.onUpdate),
  };
}

function describeIndexColumns(
  indexName: string,
  columns: ReturnType<typeof getTableConfig>["indexes"][number]["config"]["columns"],
): { name: string; desc: boolean }[] {
  return columns.map((column) => {
    if (is(column, SQL))
      return parseIndexExpression(indexName, dialect.sqlToQuery(column, "indexes").sql);
    return { name: column.name, desc: false };
  });
}

function columnEnumValues(values: readonly string[] | undefined): string[] | null {
  if (values === undefined || values.length === 0) return null;
  return [...values].sort((a, b) => a.localeCompare(b));
}

function formatDefault(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (is(value, SQL)) return dialect.sqlToQuery(value).sql;
  throw new Error(`Unsupported column default: ${typeof value}`);
}

function actionName(value: string | undefined): string {
  return value === undefined ? "NO ACTION" : value.toUpperCase();
}

function parseIndexExpression(
  indexName: string,
  expression: string,
): { name: string; desc: boolean } {
  const trimmed = expression.trim();
  const quoted = /^"((?:[^"]|"")*)"(?:\s+(ASC|DESC))?$/i.exec(trimmed);
  if (quoted?.[1] !== undefined) {
    return { name: quoted[1].replaceAll('""', '"'), desc: quoted[2]?.toUpperCase() === "DESC" };
  }
  const plain = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i.exec(trimmed);
  if (plain?.[1] !== undefined) {
    return { name: plain[1], desc: plain[2]?.toUpperCase() === "DESC" };
  }
  throw new Error(`Cannot parse index "${indexName}" expression: ${expression}`);
}

function fkSortKey(fk: ForeignKeyShape): string {
  return `${fk.columns.join("\0")}\0${fk.foreignTable}`;
}

function diffTable(left: TableShape, right: TableShape): string[] {
  return [
    ...diffColumns(left.name, left.columns, right.columns),
    ...diffPrimaryKey(left, right),
    ...diffUniques(left.name, left.uniques, right.uniques),
    ...diffForeignKeys(left.name, left.foreignKeys, right.foreignKeys),
    ...diffIndexes(left.name, left.indexes, right.indexes),
  ];
}

function diffPrimaryKey(left: TableShape, right: TableShape): string[] {
  if (sameStrings(left.primaryKey, right.primaryKey)) return [];
  return [
    `${left.name}: primaryKey differs (Drizzle ${left.primaryKey.join(", ")}, SQL ${right.primaryKey.join(", ")})`,
  ];
}

function diffColumns(table: string, left: ColumnShape[], right: ColumnShape[]): string[] {
  const leftMap = new Map(left.map((column) => [column.name, column]));
  const rightMap = new Map(right.map((column) => [column.name, column]));
  const names = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const lines: string[] = [];
  for (const name of names) {
    const drizzleColumn = leftMap.get(name);
    const sqlColumn = rightMap.get(name);
    if (!drizzleColumn || !sqlColumn) {
      const side = drizzleColumn ? "Drizzle but not in SQL" : "SQL but not in Drizzle";
      lines.push(`${table}.${name}: column is in ${side}`);
      continue;
    }
    lines.push(...diffColumnFields(table, drizzleColumn, sqlColumn));
  }
  return lines;
}

function diffColumnFields(table: string, left: ColumnShape, right: ColumnShape): string[] {
  const lines: string[] = [];
  for (const field of columnFields) {
    if (sameField(left[field], right[field])) continue;
    lines.push(
      `${table}.${left.name}: ${field} differs (Drizzle ${showValue(left[field])}, SQL ${showValue(right[field])})`,
    );
  }
  return lines;
}

function sameField(left: ColumnShape[ColumnField], right: ColumnShape[ColumnField]): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return left === right;
}

function showValue(value: ColumnShape[ColumnField]): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function diffUniques(table: string, left: string[][], right: string[][]): string[] {
  const leftKeys = new Map(canonicalUniques(left).map((columns) => [columns.join("\0"), columns]));
  const rightKeys = new Map(
    canonicalUniques(right).map((columns) => [columns.join("\0"), columns]),
  );
  const lines: string[] = [];
  for (const [key, columns] of leftKeys) {
    if (!rightKeys.has(key)) {
      lines.push(`${table}: unique (${columns.join(", ")}) is in Drizzle but not in SQL`);
    }
  }
  for (const [key, columns] of rightKeys) {
    if (!leftKeys.has(key)) {
      lines.push(`${table}: unique (${columns.join(", ")}) is in SQL but not in Drizzle`);
    }
  }
  return lines;
}

function canonicalUniques(uniques: string[][]): string[][] {
  return uniques
    .map((columns) => [...columns].sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
}

function diffForeignKeys(
  table: string,
  left: ForeignKeyShape[],
  right: ForeignKeyShape[],
): string[] {
  const leftMap = groupForeignKeys(left);
  const rightMap = groupForeignKeys(right);
  const keys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort((a, b) =>
    compareColumnLists(a.split("\0"), b.split("\0")),
  );
  const lines: string[] = [];
  for (const key of keys) {
    lines.push(...diffForeignKeyGroup(table, leftMap.get(key) ?? [], rightMap.get(key) ?? []));
  }
  return lines;
}

function groupForeignKeys(keys: ForeignKeyShape[]): Map<string, ForeignKeyShape[]> {
  const groups = new Map<string, ForeignKeyShape[]>();
  for (const fk of keys) {
    const key = fk.columns.join("\0");
    const group = groups.get(key);
    if (group) group.push(fk);
    else groups.set(key, [fk]);
  }
  return groups;
}

function diffForeignKeyGroup(
  table: string,
  left: ForeignKeyShape[],
  right: ForeignKeyShape[],
): string[] {
  // A single key on each side has an unambiguous counterpart. For multiple
  // keys, identify each unmatched target, even when only one remains per side.
  if (left.length <= 1 && right.length <= 1) {
    return diffForeignKey(table, left[0], right[0]);
  }

  const unmatchedSql = [...right];
  const unmatchedDrizzle = left.filter((fk) => {
    const match = unmatchedSql.findIndex(
      (sqlFk) =>
        fk.foreignTable === sqlFk.foreignTable &&
        sameStrings(fk.foreignColumns, sqlFk.foreignColumns) &&
        fk.onDelete === sqlFk.onDelete &&
        fk.onUpdate === sqlFk.onUpdate,
    );
    if (match === -1) return true;
    unmatchedSql.splice(match, 1);
    return false;
  });

  return [
    ...unmatchedDrizzle.map((fk) => ({ fk, side: "Drizzle but not in SQL" })),
    ...unmatchedSql.map((fk) => ({ fk, side: "SQL but not in Drizzle" })),
  ]
    .sort(
      (a, b) =>
        compareForeignKeyNames(a.fk.foreignTable, b.fk.foreignTable) ||
        compareColumnLists(a.fk.foreignColumns, b.fk.foreignColumns),
    )
    .map(
      ({ fk, side }) =>
        `${table}: foreign key (${fk.columns.join(", ")}) -> ${fk.foreignTable} (${fk.foreignColumns.join(", ")}) is in ${side}`,
    );
}

function compareForeignKeyNames(left: string, right: string): number {
  if (left === right) return 0;
  return left.localeCompare(right) || (left < right ? -1 : 1);
}

function compareColumnLists(left: string[], right: string[]): number {
  for (const [index, name] of left.entries()) {
    const other = right[index];
    if (other === undefined) return 1;
    const order = compareForeignKeyNames(name, other);
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

function diffForeignKey(
  table: string,
  drizzleFk: ForeignKeyShape | undefined,
  sqlFk: ForeignKeyShape | undefined,
): string[] {
  if (!drizzleFk || !sqlFk) {
    const present = drizzleFk ?? sqlFk;
    if (!present) return [];
    const side = drizzleFk ? "Drizzle but not in SQL" : "SQL but not in Drizzle";
    return [`${table}: foreign key (${present.columns.join(", ")}) is in ${side}`];
  }
  const cols = drizzleFk.columns.join(", ");
  const lines: string[] = [];
  if (drizzleFk.foreignTable !== sqlFk.foreignTable) {
    lines.push(
      `${table}: foreign key (${cols}) references ${sqlFk.foreignTable}, Drizzle ${drizzleFk.foreignTable}`,
    );
  }
  if (drizzleFk.onDelete !== sqlFk.onDelete) {
    lines.push(
      `${table}: foreign key (${cols}) onDelete differs (Drizzle ${drizzleFk.onDelete}, SQL ${sqlFk.onDelete})`,
    );
  }
  if (drizzleFk.onUpdate !== sqlFk.onUpdate) {
    lines.push(
      `${table}: foreign key (${cols}) onUpdate differs (Drizzle ${drizzleFk.onUpdate}, SQL ${sqlFk.onUpdate})`,
    );
  }
  if (drizzleFk.foreignColumns.join("\0") !== sqlFk.foreignColumns.join("\0")) {
    lines.push(
      `${table}: foreign key (${cols}) foreignColumns differ (Drizzle ${drizzleFk.foreignColumns.join(", ")}, SQL ${sqlFk.foreignColumns.join(", ")})`,
    );
  }
  return lines;
}

function diffIndexes(table: string, left: IndexShape[], right: IndexShape[]): string[] {
  const leftMap = new Map(left.map((index) => [index.name, index]));
  const rightMap = new Map(right.map((index) => [index.name, index]));
  const names = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const lines: string[] = [];
  for (const name of names) {
    lines.push(...diffIndex(table, name, leftMap.get(name), rightMap.get(name)));
  }
  return lines;
}

function diffIndex(
  table: string,
  name: string,
  drizzleIndex: IndexShape | undefined,
  sqlIndex: IndexShape | undefined,
): string[] {
  if (!drizzleIndex || !sqlIndex) {
    const side = drizzleIndex ? "Drizzle but not in SQL" : "SQL but not in Drizzle";
    return [`${table}: index "${name}" is in ${side}`];
  }
  const lines: string[] = [];
  if (drizzleIndex.unique !== sqlIndex.unique) {
    lines.push(
      `${table}: index "${name}" unique differs (Drizzle ${drizzleIndex.unique}, SQL ${sqlIndex.unique})`,
    );
  }
  if (drizzleIndex.partial !== sqlIndex.partial) {
    lines.push(
      `${table}: index "${name}" partial differs (Drizzle ${drizzleIndex.partial}, SQL ${sqlIndex.partial})`,
    );
  }
  const leftColumns = showIndexColumns(drizzleIndex.columns);
  const rightColumns = showIndexColumns(sqlIndex.columns);
  if (leftColumns !== rightColumns) {
    lines.push(
      `${table}: index "${name}" columns differ (Drizzle ${leftColumns}, SQL ${rightColumns})`,
    );
  }
  return lines;
}

function showIndexColumns(columns: { name: string; desc: boolean }[]): string {
  return columns.map((column) => (column.desc ? `${column.name} DESC` : column.name)).join(", ");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function balancedInner(source: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'") {
      const literal = readQuoted(source, i);
      if (!literal) return null;
      i = literal.next - 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

function parseStringInCheck(body: string): { name: string; values: string[] } | null {
  const trimmed = body.trim();
  const header = /^(?:"((?:[^"]|"")*)"|([A-Za-z_][A-Za-z0-9_]*))\s+in\s*\(/i.exec(trimmed);
  if (!header || !trimmed.endsWith(")")) return null;
  const name = (header[1] ?? header[2] ?? "").replaceAll('""', '"');
  const values = parseQuotedList(trimmed.slice(header[0].length, -1));
  if (!values) return null;
  return { name, values: [...values].sort((a, b) => a.localeCompare(b)) };
}

function parseQuotedList(source: string): string[] | null {
  const values: string[] = [];
  let i = 0;
  const skipWs = (): void => {
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
  };
  skipWs();
  if (i >= source.length) return null;
  while (i < source.length) {
    const value = readQuoted(source, i);
    if (!value) return null;
    values.push(value.text);
    i = value.next;
    skipWs();
    if (i >= source.length) return values;
    if (source[i] !== ",") return null;
    i += 1;
    skipWs();
  }
  return null;
}

function readQuoted(source: string, start: number): { text: string; next: number } | null {
  if (source[start] !== "'") return null;
  let i = start + 1;
  let text = "";
  while (i < source.length) {
    if (source[i] === "'") {
      if (source[i + 1] === "'") {
        text += "'";
        i += 2;
        continue;
      }
      return { text, next: i + 1 };
    }
    text += source[i];
    i += 1;
  }
  return null;
}
