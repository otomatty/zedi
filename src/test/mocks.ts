import type { ReactNode } from "react";
import { vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { PageRepository } from "@/lib/pageRepository";

/**
 * Mock the useAuth hook (Cognito/auth layer). Use in unit tests that need auth.
 */
export function mockAuth(options?: { isSignedIn?: boolean }) {
  const isSignedIn = options?.isSignedIn ?? false;

  vi.mock("@/hooks/useAuth", () => ({
    useAuth: () => ({
      isLoaded: true,
      isSignedIn,
      userId: isSignedIn ? "test-user-id" : null,
      getToken: vi.fn().mockResolvedValue(null),
      signOut: vi.fn(),
    }),
    useUser: () => ({
      isLoaded: true,
      isSignedIn,
      user: isSignedIn
        ? {
            id: "test-user-id",
            primaryEmailAddress: { emailAddress: "test@example.com" },
            fullName: "Test User",
            firstName: "Test",
            lastName: "User",
            imageUrl: "",
            profileImageUrl: "",
            username: "test_user",
          }
        : null,
    }),
    SignedIn: ({ children }: { children: ReactNode }) =>
      isSignedIn ? children : null,
    SignedOut: ({ children }: { children: ReactNode }) =>
      !isSignedIn ? children : null,
  }));
}

/** @deprecated Use mockAuth instead (Clerk removed). */
export const mockClerkAuth = mockAuth;

/**
 * Create a mock repository provider for testing
 */
export function createMockRepositoryHook(client: Client) {
  const repository = new PageRepository(client);

  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    userId: "test-user",
    isSignedIn: false,
    isLoaded: true,
  };
}

/**
 * Mock navigation
 */
export const mockNavigate = vi.fn();

export function mockReactRouter() {
  vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
      ...actual,
      useNavigate: () => mockNavigate,
      useParams: () => ({ id: "test-page-id" }),
    };
  });
}
