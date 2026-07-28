import { describe, it, expect } from "vitest";
import { buildSentryOptions } from "../../lib/sentryWorkerOptions.js";

describe("buildSentryOptions — Worker Sentry config (FR-3)", () => {
  it("uses the trimmed SENTRY_DSN_API and the ENVIRONMENT var", () => {
    const opts = buildSentryOptions({
      SENTRY_DSN_API: "  https://key@o0.ingest.sentry.io/1  ",
      ENVIRONMENT: "development",
    });
    expect(opts.dsn).toBe("https://key@o0.ingest.sentry.io/1");
    expect(opts.environment).toBe("development");
  });

  it("no-ops via undefined dsn when SENTRY_DSN_API is unset or blank (FR-3.3)", () => {
    expect(buildSentryOptions({}).dsn).toBeUndefined();
    expect(buildSentryOptions({ SENTRY_DSN_API: "   " }).dsn).toBeUndefined();
  });

  it("never sends default PII and keeps the health-check denyUrls", () => {
    const opts = buildSentryOptions({});
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.denyUrls?.some((re) => re.test("/api/health"))).toBe(true);
  });

  it("scrubs PII via beforeSend (same scrub as the Node runtime)", () => {
    const opts = buildSentryOptions({});
    const scrubbed = opts.beforeSend?.({
      user: { email: "user@example.com" },
    });
    expect(scrubbed?.user?.email).toBe("[Filtered]");
  });
});
