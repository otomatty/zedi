/**
 * Shared test helpers for backend route integration tests.
 */
import { vi } from "vitest";

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
export const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";
export const TEST_COGNITO_SUB = "test-cognito-sub";
export const TEST_USER_EMAIL = "test@example.com";

type MockFn = ReturnType<typeof vi.fn>;

export interface MockDb {
  select: MockFn;
  from: MockFn;
  where: MockFn;
  insert: MockFn;
  values: MockFn;
  update: MockFn;
  set: MockFn;
  delete: MockFn;
  onConflictDoUpdate: MockFn;
  onConflictDoNothing: MockFn;
  orderBy: MockFn;
  offset: MockFn;
  $dynamic: MockFn;
  innerJoin: MockFn;
  leftJoin: MockFn;
  limit: MockFn;
  returning: MockFn;
  execute: MockFn;
  then: MockFn;
}

/**
 * Create a chainable mock DB object for Drizzle ORM.
 *
 * Chaining methods (`select`, `from`, `where`, etc.) return `self`.
 * Terminal methods (`limit`, `returning`, `execute`) return resolved promises.
 * The object is also thenable (for chains without explicit terminal methods).
 *
 * Use `mockResolvedValueOnce` on terminal methods and
 * `mockImplementationOnce` on `then` to configure per-test return values.
 */
export function createMockDb(): MockDb {
  const self = {} as MockDb;

  for (const method of [
    "select",
    "from",
    "where",
    "insert",
    "values",
    "update",
    "set",
    "delete",
    "onConflictDoUpdate",
    "onConflictDoNothing",
    "orderBy",
    "offset",
    "$dynamic",
    "innerJoin",
    "leftJoin",
  ] as const) {
    self[method] = vi.fn().mockReturnValue(self);
  }

  self.limit = vi.fn().mockResolvedValue([]);
  self.returning = vi.fn().mockResolvedValue([]);
  self.execute = vi.fn().mockResolvedValue({ rows: [] });

  self.then = vi.fn((onFulfilled?: ((value: unknown) => unknown) | null) =>
    Promise.resolve([]).then(onFulfilled),
  );

  return self;
}

export const MOCK_ENV_CONFIG = {
  CORS_ORIGIN: "*",
  MEDIA_BUCKET: "test-media-bucket",
  AI_SECRETS_ARN: "arn:aws:secretsmanager:test:ai",
  RATE_LIMIT_TABLE: "test-rate-limit",
  THUMBNAIL_SECRETS_ARN: "arn:aws:secretsmanager:test:thumbnail",
  THUMBNAIL_BUCKET: "test-thumbnail-bucket",
  THUMBNAIL_CLOUDFRONT_URL: "https://thumbnails.test.example.com",
  ENVIRONMENT: "test",
  POLAR_SECRET_ARN: "arn:aws:secretsmanager:test:polar",
  COGNITO_USER_POOL_ID: "ap-northeast-1_testpool",
  COGNITO_REGION: "ap-northeast-1",
  AURORA_CLUSTER_ARN: "arn:aws:rds:ap-northeast-1:123:cluster:test",
  DB_CREDENTIALS_SECRET: "arn:aws:secretsmanager:test:db",
  AURORA_DATABASE_NAME: "zedi",
} as const;

/**
 * JSON helper: send POST/PUT requests with JSON body.
 */
export function jsonRequest(
  app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
