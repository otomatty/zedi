/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./styles/index.css";
import App from "./App";
import UILibrary from "./pages/UILibrary";

render(
  () => (
    <Router>
      <Route path="/" component={App} />
      <Route path="/ui-library" component={UILibrary} />
    </Router>
  ),
  document.getElementById("root") as HTMLElement
);
