import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types/env";
import chatRoute from "./routes/chat";

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
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  })
);

app.get("/", (c) => c.text("zedi ai api"));
app.route("/api", chatRoute);

export default app;
