import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types/env";
import imageSearchRoute from "./routes/image-search";
import thumbnailCommitRoute from "./routes/thumbnail-commit";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.CORS_ORIGIN?.split(",").map((item) => item.trim());
      if (!origin) return allowed?.[0] || "*";
      if (!allowed || allowed.includes("*")) return "*";
      return allowed.includes(origin) ? origin : allowed[0];
    },
    allowHeaders: ["Content-Type", "Authorization", "X-Gyazo-Access-Token"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  })
);

app.get("/", (c) => c.text("zedi thumbnail api"));
app.route("/api", imageSearchRoute);
app.route("/api", thumbnailCommitRoute);

export default app;
