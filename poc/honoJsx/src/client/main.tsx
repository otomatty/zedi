import { render } from "hono/jsx/dom";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);

// PWA: the service worker makes the app shell and visited pages available offline.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
}
