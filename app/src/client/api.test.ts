import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchMe } from "./api";

const me = { user: { id: "u1", email: "a@test.zedi-note.app", name: "a" }, defaultNoteId: "n1" };

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchMe", () => {
  it("returns the user when signed in", async () => {
    respond(200, me);
    expect(await fetchMe()).toEqual(me);
  });

  it("returns null when there is no session", async () => {
    respond(401, { error: "unauthorized" });
    expect(await fetchMe()).toBeNull();
  });

  it("says when the session still needs the second factor", async () => {
    respond(403, { error: "second_factor_required" });
    expect(await fetchMe()).toBe("secondFactor");
  });

  it("treats any other refusal as an error", async () => {
    respond(403, { error: "forbidden" });
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
    respond(500, {});
    await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
  });
});
