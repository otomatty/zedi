import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE, api, signIn, uniqueEmail } from "./helpers";

describe("worker app", () => {
  it("server-renders the public landing page with hono/jsx", async () => {
    const res = await SELF.fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('href="/notes"');
  });

  it("requires a session for the mock AI stream and streams SSE when signed in", async () => {
    expect((await api("/api/ai/chat?tokens=3&interval=0", null)).status).toBe(401);
    const res = await api("/api/ai/chat?tokens=3&interval=0", await signIn(uniqueEmail("ai")));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body.match(/^data: \{"t":/gm)).toHaveLength(3);
    expect(body).toContain("event: done");
  });
});
