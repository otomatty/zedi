import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfile } from "./useProfile";

const mockGetToken = vi.fn().mockResolvedValue("test-token");
const mockUpsertMe = vi.fn();

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
    getToken: mockGetToken,
    isSignedIn: true,
  }),
  useUser: () => ({ user: mockUser }),
}));

vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    upsertMe: mockUpsertMe,
  }),
}));

describe("useProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("test-token");
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

  it("seeds profile.displayName from user.fullName when API returns empty display_name", async () => {
    mockUpsertMe.mockResolvedValue({ display_name: null, avatar_url: null });

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
    mockUpsertMe.mockResolvedValue({ display_name: "", avatar_url: "" });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("github_octocat");
  });

  it("does not overwrite profile.displayName when API returns existing display_name", async () => {
    mockUpsertMe.mockResolvedValue({
      display_name: "Saved Name",
      avatar_url: "https://example.com/avatar.png",
    });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile.displayName).toBe("Saved Name");
    expect(result.current.profile.avatarUrl).toBe("https://example.com/avatar.png");
  });
});
