import { useAuth } from "@/hooks/useAuth";
import { useCallback, useMemo } from "react";
import { createAuthenticatedTursoClient, getTursoClient } from "@/lib/turso";
import type { Client } from "@libsql/client";

/**
 * Custom hook to get an authenticated Turso client using Clerk JWT
 *
 * Usage:
 * ```tsx
 * const { getClient, isSignedIn } = useTurso();
 *
 * const fetchData = async () => {
 *   const client = await getClient();
 *   const result = await client.execute("SELECT * FROM pages");
 * };
 * ```
 */
export function useTurso() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  /**
   * Get an authenticated Turso client
   * If the user is signed in, uses their JWT token for authentication
   * Otherwise, falls back to the default auth token from env
   */
  const getClient = useCallback(async (): Promise<Client> => {
    if (isSignedIn) {
      // Get JWT token from Clerk for Turso authentication
      // The template name should match your Clerk JWT template configuration
      const token = await getToken({ template: "turso" });

      if (token) {
        return await createAuthenticatedTursoClient(token);
      }
    }

    // Fallback to unauthenticated client
    return await getTursoClient();
  }, [getToken, isSignedIn]);

  return {
    getClient,
    isSignedIn: isSignedIn ?? false,
    isLoaded,
  };
}

/**
 * Hook to get the current user's ID from Clerk
 */
export function useUserId() {
  const { userId, isSignedIn, isLoaded } = useAuth();

  return {
    userId,
    isSignedIn: isSignedIn ?? false,
    isLoaded,
  };
}
