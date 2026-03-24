import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { MainAuthProvider } from "./components/auth/MainAuthProvider";
import App from "./App.tsx";
import "./index.css";
import i18n from "./i18n";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    {/* react-i18next: supply i18n to Portals (Radix ContextMenu, AlertDialog, …) / Portal 内の翻訳用 */}
    <I18nextProvider i18n={i18n}>
      <MainAuthProvider>
        <App />
      </MainAuthProvider>
    </I18nextProvider>
  </StrictMode>,
);
