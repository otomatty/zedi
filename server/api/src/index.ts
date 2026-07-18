import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { registerAgentRoutes } from "./appAgents.js";
import { captureApiException, initSentry } from "./lib/sentry.js";
import { installNodeSocketIpResolver } from "./lib/clientIpNode.js";
import { installNodeKvStoreFactory } from "./lib/kv/createKvStoreNode.js";

initSentry();
installNodeSocketIpResolver();
installNodeKvStoreFactory();
const app = createApp({ registerAgentRoutes, captureApiException });
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log("========================================");
  console.log("  Zedi API Server Started");
  console.log("========================================");
  console.log(`  Port:         ${info.port}`);
  console.log(`  Health:       http://localhost:${info.port}/api/health`);
  console.log(`  Environment:  ${process.env.NODE_ENV || "development"}`);
  console.log("========================================");
});
