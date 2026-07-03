import { Hono } from "hono";
import { Polar } from "@polar-sh/sdk";
import { getAllowedOrigins } from "../lib/cors.js";
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

  // productId は Pro プランの許可製品（環境変数）のみに限定する。
  // これがないと同一 Polar 組織の任意製品でチェックアウトでき、Webhook が
  // subscription.active を製品非依存で pro に昇格させるため権限昇格につながる。
  // Restrict productId to the configured Pro products; otherwise a user could
  // check out any product in the Polar org and get elevated to pro via the webhook.
  const allowedProductIds = [
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
    process.env.POLAR_PRO_YEARLY_PRODUCT_ID,
  ].filter((id): id is string => !!id);
  if (!allowedProductIds.includes(productId)) {
    return c.json({ error: "Invalid productId" }, 400);
  }

  const polar = new Polar({
    accessToken: getEnv("POLAR_ACCESS_TOKEN"),
    server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  });

  const allowedOrigins = getAllowedOrigins();
  const origin = c.req.header("Origin");
  let baseUrl: string | undefined;
  if (origin && allowedOrigins.includes(origin)) {
    baseUrl = origin;
  } else if (!origin && allowedOrigins.length > 0) {
    baseUrl = allowedOrigins[0];
  }
  const successUrl = baseUrl ? `${baseUrl}/pricing?checkout=success` : undefined;

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
