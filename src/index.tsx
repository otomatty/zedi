/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./styles/index.css";
import App from "./App";
import UILibrary from "./pages/UILibrary";
import Home from "./pages/Home";
import CardDetail from "./pages/CardDetail";

render(
  () => (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/card/:id" component={CardDetail} />
      <Route path="/design-system" component={App} />
      <Route path="/ui-library" component={UILibrary} />
    </Router>
  ),
  document.getElementById("root") as HTMLElement
);
