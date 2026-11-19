import { routePartykitRequest } from "partyserver";
import { createApp } from "./app";
import type { Env } from "./env";
import { authorizeRealtime } from "./realtime/authorize";

export { PageRoom } from "./pageRoom";

const app = createApp({
  routeRealtime: (request, env) =>
    routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) =>
        lobby.className === "PageRoom"
          ? authorizeRealtime(req, env, lobby.name)
          : new Response("Not found", { status: 404 }),
      onBeforeRequest: () => new Response("Not found", { status: 404 }),
    }),
});

export default app satisfies ExportedHandler<Env>;
