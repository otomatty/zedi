/**
 * /api/notes — ノート関連ルートの統合エントリーポイント
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import meRoutes from "./me.js";
import crudRoutes from "./crud.js";
import pageRoutes from "./pages.js";
import memberRoutes from "./members.js";
import inviteLinkRoutes from "./inviteLinks.js";
import domainAccessRoutes from "./domainAccess.js";
import searchRoutes from "./search.js";
import eventsRoutes from "./events.js";
import titleIndexRoutes from "./titleIndex.js";

const app = new Hono<AppEnv>();

// `me` を先にマウントして `/:noteId` のパラメータ捕捉より優先させる。
// Mount `me` first so `/me` resolves before `/:noteId` in `crud.ts`.
app.route("/", meRoutes);
app.route("/", crudRoutes);
app.route("/", pageRoutes);
app.route("/", titleIndexRoutes);
app.route("/", memberRoutes);
app.route("/", inviteLinkRoutes);
app.route("/", domainAccessRoutes);
app.route("/", searchRoutes);
app.route("/", eventsRoutes);

export default app;
