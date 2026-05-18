import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";
import "./i18n";
import "./index.css";

// Sentry は createRoot より前に初期化する（初回レンダリング時の例外も捕捉するため）。
// Initialize Sentry before createRoot so first-render exceptions are reported.
initSentry();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
