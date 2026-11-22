import { sql } from "drizzle-orm";
import {
  blob,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  describeDrizzleSchema,
  diffSchemas,
  normalizeSqliteTable,
  parseCheckEnums,
  type ColumnShape,
  type ForeignKeyShape,
  type IndexShape,
  type SchemaShape,
  type TableShape,
} from "./schemaParity";

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
});

const ownerForeignKey: ForeignKeyShape = {
  columns: ["owner_id"],
  foreignTable: "users",
  foreignColumns: ["id"],
  onDelete: "CASCADE",
  onUpdate: "NO ACTION",
};

const ownerIndex: IndexShape = {
  name: "x",
  unique: false,
  partial: false,
  columns: [{ name: "owner_id", desc: false }],
};

function column(overrides: Partial<ColumnShape> & Pick<ColumnShape, "name">): ColumnShape {
  return {
    type: "text",
    notNull: false,
    default: null,
    enumValues: null,
    ...overrides,
  };
}

function table(overrides: Partial<TableShape> & Pick<TableShape, "name">): TableShape {
  return {
    columns: [],
    primaryKey: [],
    uniques: [],
    foreignKeys: [],
    indexes: [],
    ...overrides,
  };
}

function pages(overrides: Partial<TableShape> = {}): TableShape {
  return table({
    name: "pages",
    columns: [column({ name: "id", notNull: true }), column({ name: "title", notNull: true })],
    primaryKey: ["id"],
    ...overrides,
  });
}

/** One difference, and the line names the table and the thing that differs. */
function expectOneDiff(drizzle: SchemaShape, fromSql: SchemaShape, ...needles: string[]): void {
  const diff = diffSchemas(drizzle, fromSql);
  expect(diff).toHaveLength(1);
  for (const needle of needles) expect(diff[0]).toContain(needle);
}

describe("describeDrizzleSchema", () => {
  describe("columns and keys", describeDrizzleColumnsAndKeys);
  describe("indexes", describeDrizzleIndexes);
  describe("raw index expressions", describeRawIndexExpressions);
  describe("ordering and edge cases", describeDrizzleOrderingAndEdgeCases);
});

function describeDrizzleOrderingAndEdgeCases(): void {
  it("sorts tables, columns, foreign keys, indexes, and unique constraints by name", () => {
    const notes = sqliteTable(
      "notes",
      { z: text("z"), m: text("m").unique(), a: text("a"), b: text("b") },
      (t) => [
        foreignKey({ columns: [t.z], foreignColumns: [users.id] }),
        foreignKey({ columns: [t.a], foreignColumns: [users.id] }),
        index("notes_z").on(t.z),
        index("notes_a").on(t.a),
        unique("notes_z_b").on(t.z, t.b),
        unique("notes_z_a").on(t.z, t.a),
      ],
    );

    const shape = describeDrizzleSchema([users, notes]);
    const [noteShape] = shape;
    expect(shape.map(({ name }) => name)).toEqual(["notes", "users"]);
    expect(noteShape?.columns.map(({ name }) => name)).toEqual(["a", "b", "m", "z"]);
    expect(noteShape?.foreignKeys.map(({ columns }) => columns)).toEqual([["a"], ["z"]]);
    expect(noteShape?.indexes.map(({ name }) => name)).toEqual(["notes_a", "notes_z"]);
    expect(noteShape?.uniques).toEqual([["a", "z"], ["b", "z"], ["m"]]);
  });

  it.each([
    { label: "Date", value: integer("date", { mode: "timestamp_ms" }).default(new Date(0)) },
    { label: "object", value: blob("payload", { mode: "json" }).default({ version: 1 }) },
  ])("rejects a default of type $label", ({ value }) => {
    const notes = sqliteTable("notes", { value });

    expect(() => describeDrizzleSchema([notes])).toThrow(/Unsupported column default/);
  });

  it("treats an empty enum as no enum", () => {
    // @ts-expect-error Drizzle requires a nonempty tuple in TypeScript. Exercise JavaScript input.
    const notes = sqliteTable("notes", { kind: text("kind", { enum: [] }) });

    expect(describeDrizzleSchema([notes])[0]?.columns).toEqual([column({ name: "kind" })]);
  });
}

function describeDrizzleColumnsAndKeys(): void {
  it("describes text, integer, timestamp_ms, and boolean columns", () => {
    const widgets = sqliteTable("widgets", {
      active: integer("active", { mode: "boolean" }).notNull().default(true),
      count: integer("count").notNull().default(0),
      created: integer("created")
        .notNull()
        .default(sql`(strftime('%s','now'))`),
      flag: integer("flag", { mode: "boolean" }).notNull().default(false),
      id: text("id").primaryKey(),
      name: text("name").notNull().default(""),
      note: text("note"),
      quote: text("quote").notNull().default("it's"),
      status: text("status", { enum: ["b", "a"] }).notNull(),
      touchedAt: integer("touched_at", { mode: "timestamp_ms" }).notNull(),
    });

    expect(describeDrizzleSchema([widgets])).toEqual([
      {
        name: "widgets",
        columns: [
          { name: "active", type: "integer", notNull: true, default: "1", enumValues: null },
          { name: "count", type: "integer", notNull: true, default: "0", enumValues: null },
          {
            name: "created",
            type: "integer",
            notNull: true,
            default: "(strftime('%s','now'))",
            enumValues: null,
          },
          { name: "flag", type: "integer", notNull: true, default: "0", enumValues: null },
          { name: "id", type: "text", notNull: true, default: null, enumValues: null },
          { name: "name", type: "text", notNull: true, default: "''", enumValues: null },
          { name: "note", type: "text", notNull: false, default: null, enumValues: null },
          { name: "quote", type: "text", notNull: true, default: "'it''s'", enumValues: null },
          { name: "status", type: "text", notNull: true, default: null, enumValues: ["a", "b"] },
          { name: "touched_at", type: "integer", notNull: true, default: null, enumValues: null },
        ],
        primaryKey: ["id"],
        uniques: [],
        foreignKeys: [],
        indexes: [],
      },
    ]);
  });

  it("keeps primary key column order for a single column and a composite key", () => {
    const notes = sqliteTable("notes", {
      id: text("id").primaryKey(),
    });
    const memberships = sqliteTable(
      "memberships",
      {
        noteId: text("note_id").notNull(),
        userId: text("user_id").notNull(),
      },
      (t) => [primaryKey({ columns: [t.userId, t.noteId] })],
    );

    const shape = describeDrizzleSchema([memberships, notes]);
    expect(shape.map((item) => item.name)).toEqual(["memberships", "notes"]);
    expect(shape.map((item) => item.primaryKey)).toEqual([["user_id", "note_id"], ["id"]]);
  });

  it("collects column unique() and table unique() with column names sorted inside each constraint", () => {
    const posts = sqliteTable(
      "posts",
      {
        id: text("id").primaryKey(),
        slug: text("slug").notNull().unique(),
        role: text("role").notNull(),
        userId: text("user_id").notNull(),
      },
      (t) => [unique("posts_role_user").on(t.userId, t.role)],
    );

    const [postsShape] = describeDrizzleSchema([posts]);
    expect(postsShape?.uniques).toEqual([["role", "user_id"], ["slug"]]);
  });

  it("describes references() with and without onDelete, and table foreignKey()", () => {
    const posts = sqliteTable("posts", {
      id: text("id").primaryKey(),
      authorId: text("author_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      editorId: text("editor_id").references(() => users.id),
    });
    const child = sqliteTable(
      "child",
      {
        parentId: text("parent_id").notNull(),
      },
      (t) => [
        foreignKey({ columns: [t.parentId], foreignColumns: [users.id] }).onUpdate("restrict"),
      ],
    );

    const shape = describeDrizzleSchema([posts, child, users]);
    const postsShape = shape.find((item) => item.name === "posts");
    const childShape = shape.find((item) => item.name === "child");
    expect(postsShape?.foreignKeys).toEqual([
      {
        columns: ["author_id"],
        foreignTable: "users",
        foreignColumns: ["id"],
        onDelete: "CASCADE",
        onUpdate: "NO ACTION",
      },
      {
        columns: ["editor_id"],
        foreignTable: "users",
        foreignColumns: ["id"],
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
      },
    ]);
    expect(childShape?.foreignKeys).toEqual([
      {
        columns: ["parent_id"],
        foreignTable: "users",
        foreignColumns: ["id"],
        onDelete: "NO ACTION",
        onUpdate: "RESTRICT",
      },
    ]);
  });
}

function describeDrizzleIndexes(): void {
  it("describes index(), uniqueIndex().where(), and a DESC expression", () => {
    const posts = sqliteTable(
      "posts",
      {
        id: text("id").primaryKey(),
        authorId: text("author_id").notNull(),
        editorId: text("editor_id"),
      },
      (t) => [
        index("posts_author").on(t.authorId),
        uniqueIndex("posts_editor_partial")
          .on(t.editorId)
          .where(sql`${t.editorId} is not null`),
        index("posts_id_desc").on(sql`${t.id} DESC`),
      ],
    );

    const [postsShape] = describeDrizzleSchema([posts]);
    expect(postsShape?.indexes).toEqual([
      {
        name: "posts_author",
        unique: false,
        partial: false,
        columns: [{ name: "author_id", desc: false }],
      },
      {
        name: "posts_editor_partial",
        unique: true,
        partial: true,
        columns: [{ name: "editor_id", desc: false }],
      },
      {
        name: "posts_id_desc",
        unique: false,
        partial: false,
        columns: [{ name: "id", desc: true }],
      },
    ]);
  });

  it("throws with the index name and the expression when a column and direction cannot be read", () => {
    const bad = sqliteTable("bad", { title: text("title").notNull() }, (t) => [
      index("bad_lower_title").on(sql`lower(${t.title})`),
    ]);

    expect(() => describeDrizzleSchema([bad])).toThrow(/bad_lower_title/);
    expect(() => describeDrizzleSchema([bad])).toThrow(/lower/);
  });
}

function describeRawIndexExpressions(): void {
  it.each([
    ["updated_at desc", "updated_at", true],
    ["updated_at", "updated_at", false],
    ["updated_at Desc", "updated_at", true],
    ["  updated_at   DESC  ", "updated_at", true],
    ["updated_at Asc", "updated_at", false],
    ['"we""ird" DESC', 'we"ird', true],
  ])("reads the index expression %s", (expression, name, desc) => {
    const notes = sqliteTable("notes", { updatedAt: integer("updated_at") }, () => [
      index("notes_expression").on(sql.raw(expression)),
    ]);

    expect(describeDrizzleSchema([notes])[0]?.indexes).toEqual([
      { name: "notes_expression", unique: false, partial: false, columns: [{ name, desc }] },
    ]);
  });

  it.each(["lower(title)", 'x"title" DESC', '"title" DESC x', "updated_at DESCENDING", "1col"])(
    "rejects the index expression %s",
    (expression) => {
      const notes = sqliteTable("notes", { title: text("title") }, () => [
        index("notes_expression").on(sql.raw(expression)),
      ]);

      expect(() => describeDrizzleSchema([notes])).toThrow(/notes_expression/);
      expect(() => describeDrizzleSchema([notes])).toThrow(expression);
    },
  );
}

describe("diffSchemas", () => {
  describe("tables and columns", describeTableAndColumnDiffs);
  describe("constraints", describeConstraintDiffs);
  describe("indexes", describeIndexDiffs);
  describe("exact diagnostics", describeDiffDiagnostics);
  describe("multi-column keys", describeMultiColumnKeys);
});

function describeTableAndColumnDiffs(): void {
  it("returns no lines when the shapes match", () => {
    const shape = [
      pages({
        uniques: [["slug"]],
        foreignKeys: [
          {
            columns: ["author_id"],
            foreignTable: "users",
            foreignColumns: ["id"],
            onDelete: "CASCADE",
            onUpdate: "NO ACTION",
          },
        ],
        indexes: [
          {
            name: "pages_title",
            unique: false,
            partial: false,
            columns: [{ name: "title", desc: false }],
          },
        ],
      }),
    ];
    expect(diffSchemas(shape, shape)).toEqual([]);
  });

  it("reports a table that exists only on one side", () => {
    expectOneDiff([], [table({ name: "notes" })], "notes");
    expectOneDiff([table({ name: "notes" })], [], "notes");
  });

  it("reports a column that exists only on one side", () => {
    const withTitle = pages();
    const withoutTitle = pages({
      columns: [column({ name: "id", notNull: true })],
    });
    expectOneDiff([withTitle], [withoutTitle], "pages", "title");
    expectOneDiff([withoutTitle], [withTitle], "pages", "title");
  });

  it("reports a column type difference", () => {
    expectOneDiff(
      [pages()],
      [
        pages({
          columns: [
            column({ name: "id", notNull: true }),
            column({ name: "title", type: "integer", notNull: true }),
          ],
        }),
      ],
      "pages",
      "title",
      "type",
    );
  });

  it("reports a notNull difference", () => {
    expectOneDiff(
      [pages()],
      [
        pages({
          columns: [
            column({ name: "id", notNull: true }),
            column({ name: "title", notNull: false }),
          ],
        }),
      ],
      "pages",
      "title",
      "notNull",
    );
  });

  it("reports a default difference", () => {
    expectOneDiff(
      [pages()],
      [
        pages({
          columns: [
            column({ name: "id", notNull: true }),
            column({ name: "title", notNull: true, default: "''" }),
          ],
        }),
      ],
      "pages",
      "title",
      "default",
    );
  });

  it("reports an enumValues difference", () => {
    expectOneDiff(
      [pages()],
      [
        pages({
          columns: [
            column({ name: "id", notNull: true }),
            column({ name: "title", notNull: true, enumValues: ["draft", "published"] }),
          ],
        }),
      ],
      "pages",
      "title",
      "enumValues",
    );
  });
}

function describeConstraintDiffs(): void {
  it("reports a primaryKey difference", () => {
    expectOneDiff([pages()], [pages({ primaryKey: ["id", "title"] })], "pages", "primaryKey");
  });

  it("reports a unique constraint that exists only on one side", () => {
    expectOneDiff([pages({ uniques: [["slug"]] })], [pages()], "pages", "slug");
    expectOneDiff([pages()], [pages({ uniques: [["slug"]] })], "pages", "slug");
  });

  it("reports a foreign key whose referenced table differs", () => {
    const drizzleFk: ForeignKeyShape = {
      columns: ["author_id"],
      foreignTable: "users",
      foreignColumns: ["id"],
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    };
    const sqlFk: ForeignKeyShape = { ...drizzleFk, foreignTable: "posts" };
    expectOneDiff(
      [pages({ foreignKeys: [drizzleFk] })],
      [pages({ foreignKeys: [sqlFk] })],
      "pages",
      "author_id",
      "posts",
    );
  });

  it("reports a foreign key whose onDelete differs", () => {
    const drizzleFk: ForeignKeyShape = {
      columns: ["author_id"],
      foreignTable: "users",
      foreignColumns: ["id"],
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    };
    const sqlFk: ForeignKeyShape = { ...drizzleFk, onDelete: "NO ACTION" };
    expectOneDiff(
      [pages({ foreignKeys: [drizzleFk] })],
      [pages({ foreignKeys: [sqlFk] })],
      "pages",
      "author_id",
      "onDelete",
    );
  });
}

function describeIndexDiffs(): void {
  it("reports an index that exists only on one side", () => {
    const onlySql: IndexShape = {
      name: "notes_one_default_per_owner",
      unique: true,
      partial: true,
      columns: [{ name: "owner_id", desc: false }],
    };
    expectOneDiff(
      [table({ name: "notes" })],
      [table({ name: "notes", indexes: [onlySql] })],
      "notes",
      "notes_one_default_per_owner",
    );
    expectOneDiff(
      [table({ name: "notes", indexes: [onlySql] })],
      [table({ name: "notes" })],
      "notes",
      "notes_one_default_per_owner",
    );
  });

  it("reports an index unique difference", () => {
    const drizzleIndex: IndexShape = {
      name: "pages_title",
      unique: false,
      partial: false,
      columns: [{ name: "title", desc: false }],
    };
    expectOneDiff(
      [pages({ indexes: [drizzleIndex] })],
      [pages({ indexes: [{ ...drizzleIndex, unique: true }] })],
      "pages",
      "pages_title",
      "unique",
    );
  });

  it("reports an index partial difference", () => {
    const drizzleIndex: IndexShape = {
      name: "pages_title",
      unique: false,
      partial: true,
      columns: [{ name: "title", desc: false }],
    };
    expectOneDiff(
      [pages({ indexes: [drizzleIndex] })],
      [pages({ indexes: [{ ...drizzleIndex, partial: false }] })],
      "pages",
      "pages_title",
      "partial",
    );
  });

  it("reports an index column list difference", () => {
    const drizzleIndex: IndexShape = {
      name: "pages_title",
      unique: false,
      partial: false,
      columns: [{ name: "title", desc: false }],
    };
    expectOneDiff(
      [pages({ indexes: [drizzleIndex] })],
      [pages({ indexes: [{ ...drizzleIndex, columns: [{ name: "id", desc: false }] }] })],
      "pages",
      "pages_title",
      "id",
    );
  });

  it("reports an index column DESC difference", () => {
    const drizzleIndex: IndexShape = {
      name: "pages_updated",
      unique: false,
      partial: false,
      columns: [{ name: "updated_at", desc: true }],
    };
    const asc: IndexShape = {
      ...drizzleIndex,
      columns: [{ name: "updated_at", desc: false }],
    };
    expectOneDiff(
      [pages({ indexes: [drizzleIndex] })],
      [pages({ indexes: [asc] })],
      "pages",
      "pages_updated",
      "updated_at",
    );
    const diff = diffSchemas([pages({ indexes: [drizzleIndex] })], [pages({ indexes: [asc] })]);
    expect(diff[0]).toMatch(/desc/i);
  });
}

function describeDiffDiagnostics(): void {
  const notes = table({ name: "notes" });

  it("orders the full diff by table, column, and index names", () => {
    const drizzle = [
      table({ name: "zebra", columns: [column({ name: "title" })] }),
      table({
        name: "notes",
        columns: [column({ name: "z" }), column({ name: "b" })],
        indexes: [
          { ...ownerIndex, name: "z" },
          { ...ownerIndex, name: "b" },
        ],
      }),
    ];
    const fromSql = [
      table({
        name: "notes",
        columns: [column({ name: "y" }), column({ name: "a" })],
        indexes: [
          { ...ownerIndex, name: "y" },
          { ...ownerIndex, name: "a" },
        ],
      }),
      table({ name: "zebra" }),
      table({ name: "alpha" }),
    ];

    expect(diffSchemas(drizzle, fromSql)).toEqual([
      "alpha: table is in SQL but not in Drizzle",
      "notes.a: column is in SQL but not in Drizzle",
      "notes.b: column is in Drizzle but not in SQL",
      "notes.y: column is in SQL but not in Drizzle",
      "notes.z: column is in Drizzle but not in SQL",
      'notes: index "a" is in SQL but not in Drizzle',
      'notes: index "b" is in Drizzle but not in SQL',
      'notes: index "y" is in SQL but not in Drizzle',
      'notes: index "z" is in Drizzle but not in SQL',
      "zebra.title: column is in Drizzle but not in SQL",
    ]);
  });

  it.each([
    { label: "table", present: [notes], absent: [], subject: "notes: table" },
    {
      label: "column",
      present: [{ ...notes, columns: [column({ name: "title" })] }],
      absent: [notes],
      subject: "notes.title: column",
    },
    {
      label: "index",
      present: [{ ...notes, indexes: [ownerIndex] }],
      absent: [notes],
      subject: 'notes: index "x"',
    },
    {
      label: "foreign key",
      present: [{ ...notes, foreignKeys: [ownerForeignKey] }],
      absent: [notes],
      subject: "notes: foreign key (owner_id)",
    },
    {
      label: "unique",
      present: [{ ...notes, uniques: [["a", "b"]] }],
      absent: [notes],
      subject: "notes: unique (a, b)",
    },
  ])("names the side with the missing $label", ({ present, absent, subject }) => {
    expect(diffSchemas(present, absent)).toEqual([`${subject} is in Drizzle but not in SQL`]);
    expect(diffSchemas(absent, present)).toEqual([`${subject} is in SQL but not in Drizzle`]);
  });

  it("prints changes to the foreign key update action and referenced columns", () => {
    const withOwnerKey = (changes: Partial<ForeignKeyShape>): SchemaShape => [
      { ...notes, foreignKeys: [{ ...ownerForeignKey, ...changes }] },
    ];

    expect(diffSchemas(withOwnerKey({}), withOwnerKey({ onUpdate: "RESTRICT" }))).toEqual([
      "notes: foreign key (owner_id) onUpdate differs (Drizzle NO ACTION, SQL RESTRICT)",
    ]);
    expect(diffSchemas(withOwnerKey({}), withOwnerKey({ foreignColumns: ["uuid"] }))).toEqual([
      "notes: foreign key (owner_id) foreignColumns differ (Drizzle id, SQL uuid)",
    ]);
  });

  it("prints null defaults, enum values, and composite primary keys", () => {
    const original = pages({
      columns: [column({ name: "id" }), column({ name: "title" })],
      primaryKey: ["id", "title"],
    });
    const updated = pages({
      columns: [
        column({ name: "id" }),
        column({ name: "title", default: "''", enumValues: ["a", "b"] }),
      ],
      primaryKey: ["id"],
    });

    expect(diffSchemas([original], [updated])).toEqual([
      "pages.title: default differs (Drizzle null, SQL '')",
      "pages.title: enumValues differs (Drizzle null, SQL a, b)",
      "pages: primaryKey differs (Drizzle id, title, SQL id)",
    ]);
    expect(diffSchemas([updated], [original])).toEqual([
      "pages.title: default differs (Drizzle '', SQL null)",
      "pages.title: enumValues differs (Drizzle a, b, SQL null)",
      "pages: primaryKey differs (Drizzle id, SQL id, title)",
    ]);
  });
}

function describeMultiColumnKeys(): void {
  it("distinguishes unique constraint columns with the same concatenated name", () => {
    const drizzle = table({ name: "notes", uniques: [["ab", "c"]] });
    const fromSql = table({ name: "notes", uniques: [["a", "bc"]] });

    expect(diffSchemas([drizzle], [fromSql]).sort()).toEqual([
      "notes: unique (a, bc) is in SQL but not in Drizzle",
      "notes: unique (ab, c) is in Drizzle but not in SQL",
    ]);
  });

  it("distinguishes foreign key columns with the same concatenated name", () => {
    const target = { ...ownerForeignKey, foreignColumns: ["id", "scope"] };
    const drizzle = table({ name: "notes", foreignKeys: [{ ...target, columns: ["ab", "c"] }] });
    const fromSql = table({ name: "notes", foreignKeys: [{ ...target, columns: ["a", "bc"] }] });

    expect(diffSchemas([drizzle], [fromSql]).sort()).toEqual([
      "notes: foreign key (a, bc) is in SQL but not in Drizzle",
      "notes: foreign key (ab, c) is in Drizzle but not in SQL",
    ]);
  });
}

describe("normalizeSqliteTable", () => {
  it("marks only the single primary key column as not null", () => {
    const id = column({ name: "id" });
    const title = column({ name: "title" });
    const slug = column({ name: "slug", notNull: true });
    const source = table({ name: "pages", columns: [title, id, slug], primaryKey: ["id"] });

    expect(normalizeSqliteTable(source)).toEqual({
      ...source,
      columns: [title, { ...id, notNull: true }, slug],
    });
  });

  it.each([
    { key: "composite", primaryKey: ["id", "title"] },
    { key: "absent", primaryKey: [] },
  ])("preserves column nullability when the primary key is $key", ({ primaryKey }) => {
    const columns = [column({ name: "id" }), column({ name: "title", notNull: true })];
    const source = table({ name: "pages", columns, primaryKey });
    const original = structuredClone(source);

    expect(normalizeSqliteTable(source)).toEqual(original);
  });

  it("does not mutate the input table", () => {
    const source = table({
      name: "pages",
      columns: [column({ name: "id" })],
      primaryKey: ["id"],
    });
    const original = structuredClone(source);

    normalizeSqliteTable(source);

    expect(source).toEqual(original);
  });
});

describe("parseCheckEnums", () => {
  it.each([
    "CHECK (a IN ('x',))",
    "CHECK (a IN ())",
    "CHECK (a IN ('x' 'y'))",
    "CHECK (lower(a) IN ('x'))",
  ])("ignores %s and reads a valid CHECK that follows", (malformed) => {
    const createTable = `CREATE TABLE docs (a TEXT, b TEXT, ${malformed}, CHECK (b IN ('y')))`;

    expect(parseCheckEnums(createTable)).toEqual(new Map([["b", ["y"]]]));
  });

  it("ignores an unterminated string and preserves earlier valid checks", () => {
    const createTable = "CREATE TABLE docs (b TEXT CHECK (b IN ('y')), a TEXT CHECK (a IN ('x))";

    expect(parseCheckEnums(createTable)).toEqual(new Map([["b", ["y"]]]));
  });

  it.each(["check(a in ('x'))", "CHECK (a IN('x'))"])("accepts %s", (constraint) => {
    const createTable = `CREATE TABLE docs (a TEXT ${constraint})`;

    expect(parseCheckEnums(createTable)).toEqual(new Map([["a", ["x"]]]));
  });

  it("keeps parentheses inside string literals", () => {
    const createTable = "CREATE TABLE docs (kind TEXT CHECK (kind IN ('a)', '(b')))";

    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({ kind: ["(b", "a)"] });
  });

  it("keeps an escaped quote and a parenthesis in the same string literal", () => {
    const createTable = "CREATE TABLE docs (kind TEXT CHECK (kind IN ('it''s)', 'other')))";

    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({ kind: ["it's)", "other"] });
  });

  it("reads one CHECK (col IN (...)) list and sorts the values", () => {
    const createTable = "CREATE TABLE docs (status TEXT CHECK (status IN ('published', 'draft')))";
    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({
      status: ["draft", "published"],
    });
  });

  it("reads every IN check in the statement", () => {
    const createTable = `CREATE TABLE memberships (
      role TEXT CHECK (role IN ('owner', 'editor')),
      status TEXT CHECK (status IN ('published', 'draft'))
    )`;
    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({
      role: ["editor", "owner"],
      status: ["draft", "published"],
    });
  });

  it("accepts a quoted column name", () => {
    const createTable = `CREATE TABLE memberships (role TEXT CHECK ("role" IN ('owner', 'editor')))`;
    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({
      role: ["editor", "owner"],
    });
  });

  it("accepts uppercase CHECK and IN with irregular whitespace", () => {
    const createTable =
      "CREATE TABLE docs (status TEXT, CONSTRAINT docs_status CHECK ( status IN ( 'published' , 'draft' ) ))";
    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({
      status: ["draft", "published"],
    });
  });

  it("ignores CHECK constraints that are not a string IN list", () => {
    const createTable = `CREATE TABLE docs (
      title TEXT CHECK (length(title) > 0),
      status TEXT CHECK (status IN ('b', 'a')),
      n INTEGER CHECK (n IN (1, 2))
    )`;
    expect(Object.fromEntries(parseCheckEnums(createTable))).toEqual({
      status: ["a", "b"],
    });
  });

  it("returns an empty map when the statement has no CHECK", () => {
    expect(parseCheckEnums("CREATE TABLE docs (id TEXT PRIMARY KEY)")).toEqual(new Map());
  });
});
