import { StrictMode, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { MockClerkProvider } from "./components/auth/MockClerkProvider";
import App from "./App.tsx";
import "./index.css";

// Check if we're in E2E test mode
const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY && !isE2EMode) {
  throw new Error("Missing Clerk Publishable Key");
}

// Clerk automatically determines the correct Frontend API URL from the publishableKey
// No need to explicitly set clerkJSUrl - Clerk will handle it automatically

/**
 * Auth provider wrapper that uses MockClerkProvider in E2E test mode
 * and real ClerkProvider in production.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  if (isE2EMode) {
    console.log("[E2E Mode] Using MockClerkProvider");
    return <MockClerkProvider>{children}</MockClerkProvider>;
  }

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY!} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
