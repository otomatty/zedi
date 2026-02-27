import { Hono } from "hono";
import { Polar } from "@polar-sh/sdk";
import { authRequired } from "../middleware/auth.js";
import { getEnv } from "../lib/env.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

app.post("/checkout", authRequired, async (c) => {
  const userId = c.get("userId");
  const { productId } = await c.req.json<{ productId: string }>();

  if (!productId) {
    return c.json({ error: "productId is required" }, 400);
  }

  const polar = new Polar({
    accessToken: getEnv("POLAR_ACCESS_TOKEN"),
    server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  });

  const corsOrigin = process.env.CORS_ORIGIN;
  const successUrl =
    corsOrigin && corsOrigin !== "*" ? `${corsOrigin}/pricing?checkout=success` : undefined;

  const checkout = await polar.checkouts.create({
    products: [productId],
    externalCustomerId: userId,
    ...(successUrl ? { successUrl } : {}),
  });

  return c.json({ url: checkout.url });
});

app.post("/customer-portal", authRequired, async (c) => {
  const userId = c.get("userId");

  const polar = new Polar({
    accessToken: getEnv("POLAR_ACCESS_TOKEN"),
    server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  });

  const portal = await polar.customerSessions.create({
    externalCustomerId: userId,
  });

  return c.json({ url: portal.customerPortalUrl });
});

export default app;
