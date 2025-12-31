import { createClient, Client } from "@libsql/client/web";

// Turso database configuration
const TURSO_DATABASE_URL = import.meta.env.VITE_TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN;

// Create a basic Turso client (remote)
export function createTursoClient(): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN,
  });
}

// Create an authenticated Turso client using Clerk JWT
export function createAuthenticatedTursoClient(jwtToken: string): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: jwtToken,
  });
}

// Singleton client instance for remote access
let tursoClient: Client | null = null;

export function getTursoClient(): Client {
  if (!tursoClient) {
    tursoClient = createTursoClient();
  }
  return tursoClient;
}
