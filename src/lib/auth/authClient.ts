import { createAuthClient } from "better-auth/react";

function getAuthBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === "string" && env.trim() !== "") return env.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
