/**
 * 共通レスポンス・エラーハンドリング
 * CORS ヘッダーと JSON ボディを統一
 */

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {number} statusCode
 * @returns {{ statusCode: number; headers: Record<string, string>; body: string }}
 */
export function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: getCorsHeaders(),
    body: JSON.stringify(body),
  };
}

/**
 * @param {unknown} data
 * @returns {{ statusCode: number; headers: Record<string, string>; body: string }}
 */
export function success(data) {
  return json({ ok: true, data }, 200);
}

/**
 * @param {string} message
 * @param {number} statusCode
 * @param {string} [code]
 * @returns {{ statusCode: number; headers: Record<string, string>; body: string }}
 */
export function error(message, statusCode = 500, code = "INTERNAL_ERROR") {
  return json(
    {
      ok: false,
      error: { code, message },
    },
    statusCode
  );
}

/** 401 Unauthorized */
export function unauthorized(message = "Unauthorized") {
  return error(message, 401, "UNAUTHORIZED");
}

/** 403 Forbidden */
export function forbidden(message = "Forbidden") {
  return error(message, 403, "FORBIDDEN");
}

/** 404 Not Found */
export function notFound(message = "Not found") {
  return error(message, 404, "NOT_FOUND");
}

/** 400 Bad Request */
export function badRequest(message = "Bad request") {
  return error(message, 400, "BAD_REQUEST");
}

/** OPTIONS (CORS preflight) */
export function corsPreflight() {
  return {
    statusCode: 204,
    headers: {
      ...getCorsHeaders(),
      "Content-Length": "0",
    },
    body: "",
  };
}

/**
 * 302 redirect (e.g. for GET /api/media/:id → presigned S3 URL)
 * @param {string} location
 * @returns {{ statusCode: number; headers: Record<string, string>; body: string }}
 */
export function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      ...getCorsHeaders(),
      Location: location,
    },
    body: "",
  };
}
