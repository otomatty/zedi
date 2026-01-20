import { Hono } from "hono";
import type { Env } from "../types/env";
import { searchImages } from "../services/search";

const route = new Hono<{ Bindings: Env }>();

route.get("/image-search", async (c) => {
  const query = c.req.query("query")?.trim() || "";
  const limit = Math.min(
    Math.max(Number(c.req.query("limit") || 10), 1),
    30
  );
  const cursor = Math.max(Number(c.req.query("cursor") || 1), 1);

  if (!query) {
    return c.json({ items: [], nextCursor: undefined });
  }

  try {
    const result = await searchImages({
      query,
      cursor,
      limit,
      env: c.env,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "画像検索に失敗しました",
      },
      500
    );
  }
});

export default route;
