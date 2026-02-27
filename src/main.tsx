import { StrictMode, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MockAuthProvider } from "./components/auth/MockAuthProvider";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

function AuthProvider({ children }: { children: ReactNode }) {
  if (isE2EMode) {
    return <MockAuthProvider>{children}</MockAuthProvider>;
  }
  return <>{children}</>;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
