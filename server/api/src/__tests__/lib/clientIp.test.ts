import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { extractClientIp, setSocketIpResolver } from "../../lib/clientIp.js";

function buildApp() {
  const app = new Hono<AppEnv>();
  app.get("/ip", (c) => c.json({ ip: extractClientIp(c) }));
  return app;
}

async function requestIp(
  headers: Record<string, string>,
  env?: Record<string, string>,
): Promise<string | null> {
  const res = await buildApp().request("/ip", { headers }, env);
  const body = (await res.json()) as { ip: string | null };
  return body.ip;
}

afterEach(() => {
  vi.unstubAllEnvs();
  setSocketIpResolver(null);
});

describe("extractClientIp — Workers runtime (FR-2 / SR-5)", () => {
  it("prefers CF-Connecting-IP over spoofed x-forwarded-for without TRUST_PROXY", async () => {
    const ip = await requestIp(
      { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.99" },
      { RUNTIME: "cloudflare-workers" },
    );
    expect(ip).toBe("203.0.113.7");
  });

  it("falls back to trusted proxy headers when CF header is absent", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const ip = await requestIp(
      { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
      { RUNTIME: "cloudflare-workers" },
    );
    expect(ip).toBe("203.0.113.1");
  });
});

describe("extractClientIp — Node runtime", () => {
  it("ignores CF-Connecting-IP when RUNTIME is not cloudflare-workers (spoofing guard)", async () => {
    const ip = await requestIp({ "cf-connecting-ip": "203.0.113.7" });
    expect(ip).toBeNull();
  });

  it("keeps x-forwarded-for-first behavior under TRUST_PROXY=true", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const ip = await requestIp({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(ip).toBe("203.0.113.1");
  });

  it("uses the injected socket resolver as the fallback", async () => {
    setSocketIpResolver(() => "10.0.0.5");
    const ip = await requestIp({});
    expect(ip).toBe("10.0.0.5");
  });

  it("returns null when no resolver is injected and proxy is untrusted", async () => {
    const ip = await requestIp({ "x-forwarded-for": "198.51.100.99" });
    expect(ip).toBeNull();
  });
});
