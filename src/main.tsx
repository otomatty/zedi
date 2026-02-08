import { StrictMode, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CognitoAuthProvider } from "./components/auth/CognitoAuthProvider";
import { MockClerkProvider } from "./components/auth/MockClerkProvider";
import App from "./App.tsx";
import "./index.css";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

function AuthProvider({ children }: { children: ReactNode }) {
  if (isE2EMode) {
    return <MockClerkProvider>{children}</MockClerkProvider>;
  }
  return <CognitoAuthProvider>{children}</CognitoAuthProvider>;
}

// Require Cognito config when not E2E (no build-time throw; fails at first auth use if missing)
if (!isE2EMode && !import.meta.env.VITE_COGNITO_DOMAIN) {
  console.warn("[Auth] VITE_COGNITO_DOMAIN is not set; sign-in will fail.");
}
if (!isE2EMode && !import.meta.env.VITE_COGNITO_CLIENT_ID) {
  console.warn("[Auth] VITE_COGNITO_CLIENT_ID is not set; sign-in will fail.");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
