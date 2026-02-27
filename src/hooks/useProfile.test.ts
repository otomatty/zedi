import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfile } from "./useProfile";

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

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isSignedIn: true,
  }),
  useUser: () => ({ user: mockUser }),
}));

describe("useProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("seeds profile.displayName from user.fullName when API returns empty display_name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { name: "", image: "" } }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile());

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

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("Saved Name");
    expect(result.current.profile.avatarUrl).toBe("https://example.com/avatar.png");
  });
});
