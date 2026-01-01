import { vi } from "vitest";
import type { Database } from "sql.js";
import { LocalPageRepository } from "@/lib/localPageRepository";

/**
 * Mock the useAuth hook from Clerk
 */
export function mockClerkAuth(options?: { isSignedIn?: boolean }) {
  const isSignedIn = options?.isSignedIn ?? false;

  vi.mock("@clerk/clerk-react", () => ({
    useAuth: () => ({
      isSignedIn,
      isLoaded: true,
      userId: isSignedIn ? "test-user-id" : null,
      getToken: vi.fn().mockResolvedValue(null),
    }),
  }));
}

/**
 * Create a mock repository provider for testing
 */
export function createMockRepositoryHook(db: Database) {
  const repository = new LocalPageRepository(db);

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
