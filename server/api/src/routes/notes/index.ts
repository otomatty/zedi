/**
 * /api/notes — ノート関連ルートの統合エントリーポイント
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import crudRoutes from "./crud.js";
import pageRoutes from "./pages.js";
import memberRoutes from "./members.js";

const app = new Hono<AppEnv>();

app.route("/", crudRoutes);
app.route("/", pageRoutes);
app.route("/", memberRoutes);

export default app;
