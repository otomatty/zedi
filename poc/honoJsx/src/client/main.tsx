import { render } from "hono/jsx/dom";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
