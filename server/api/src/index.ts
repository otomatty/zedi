import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = createApp();
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
