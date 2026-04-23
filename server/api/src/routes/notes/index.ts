/**
 * /api/notes — ノート関連ルートの統合エントリーポイント
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import crudRoutes from "./crud.js";
import pageRoutes from "./pages.js";
import memberRoutes from "./members.js";
import inviteLinkRoutes from "./inviteLinks.js";
import domainAccessRoutes from "./domainAccess.js";
import searchRoutes from "./search.js";

const app = new Hono<AppEnv>();

app.route("/", crudRoutes);
app.route("/", pageRoutes);
app.route("/", memberRoutes);
app.route("/", inviteLinkRoutes);
app.route("/", domainAccessRoutes);
app.route("/", searchRoutes);

export default app;
