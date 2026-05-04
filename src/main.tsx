import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { MainAuthProvider } from "./components/auth/MainAuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";
import App from "./App.tsx";
import "./index.css";
import i18n from "./i18n";

// Sentry は createRoot より前に初期化し、初回レンダリング時の例外も捕捉できるようにする。
// Initialize Sentry before createRoot so first-render exceptions are reported.
initSentry();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    {/* react-i18next: supply i18n to Portals (Radix ContextMenu, AlertDialog, …) / Portal 内の翻訳用 */}
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <MainAuthProvider>
          <App />
        </MainAuthProvider>
      </ErrorBoundary>
    </I18nextProvider>
  </StrictMode>,
);
