import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfile } from "@/hooks/auth/useProfile";

let mockIsSignedIn = true;
let mockUser: {
  id: string;
  fullName: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  profileImageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
} = {
  id: "user-1",
  fullName: "Google User",
  username: "google_123",
  firstName: "Google",
  lastName: "User",
  imageUrl: "",
  profileImageUrl: "",
  primaryEmailAddress: { emailAddress: "u@example.com" },
};

vi.mock("@/hooks/auth/useAuth", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: mockIsSignedIn,
  }),
  useUser: () => ({ user: mockUser }),
}));

describe("useProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSignedIn = true;
    mockUser = {
      id: "user-1",
      fullName: "Google User",
      username: "google_123",
      firstName: "Google",
      lastName: "User",
      imageUrl: "",
      profileImageUrl: "",
      primaryEmailAddress: { emailAddress: "u@example.com" },
    };
    localStorage.removeItem("zedi-profile-cache");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the cached profile without loading or fetching from the first signed-out render", () => {
    mockIsSignedIn = false;
    const cached = { displayName: "Cached Name", avatarUrl: "https://example.com/cached.png" };
    localStorage.setItem("zedi-profile-cache", JSON.stringify(cached));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const loadingStates: boolean[] = [];

    const { result } = renderHook(() => {
      const profile = useProfile();
      loadingStates.push(profile.isLoading);
      return profile;
    });

    expect(loadingStates[0]).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.profile).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops loading on sign-out even while the initial request is pending", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(true);

    mockIsSignedIn = false;
    rerender();

    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/\/api\/users\/me$/), {
      credentials: "include",
    });
  });

  it("loads until the request completes when signing in after the signed-out mount", async () => {
    mockIsSignedIn = false;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { name: "Signed In", image: "" } }), { status: 200 }),
      );
    const { result, rerender } = renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(false);

    mockIsSignedIn = true;
    rerender();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile.displayName).toBe("Signed In");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("seeds profile.displayName from user.fullName when API returns empty display_name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { name: "", image: "" } }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("Google User");
    expect(result.current.profile.avatarUrl).toBe("");
  });

  it("seeds profile.displayName from user.username when API returns empty display_name and fullName is null", async () => {
    mockUser = {
      id: "user-2",
      fullName: null,
      username: "github_octocat",
      firstName: null,
      lastName: null,
      imageUrl: "",
      profileImageUrl: "",
      primaryEmailAddress: null,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { name: "", image: "" } }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("github_octocat");
  });

  it("does not overwrite profile.displayName when API returns existing display_name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: { name: "Saved Name", image: "https://example.com/avatar.png" },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("Saved Name");
    expect(result.current.profile.avatarUrl).toBe("https://example.com/avatar.png");
  });
});
