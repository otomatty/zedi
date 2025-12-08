/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./styles/index.css";
import App from "./App";
import UILibrary from "./pages/UILibrary";
import Home from "./pages/Home";
import PageDetail from "./pages/PageDetail";
import Login from "./pages/Login";
import { AuthGuard } from "./components/auth/AuthGuard";

render(
  () => (
    <Router>
      {/* Public route */}
      <Route path="/login" component={Login} />
      
      {/* Protected routes */}
      <Route path="/" component={() => <AuthGuard><Home /></AuthGuard>} />
      <Route path="/page/:id" component={() => <AuthGuard><PageDetail /></AuthGuard>} />
      <Route path="/design-system" component={() => <AuthGuard><App /></AuthGuard>} />
      <Route path="/ui-library" component={() => <AuthGuard><UILibrary /></AuthGuard>} />
    </Router>
  ),
  document.getElementById("root") as HTMLElement
);

