import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./theme.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";

// In the Tauri desktop shell the app is served from a tauri:// origin, so HTML5
// path routing can't resolve deep links / refreshes — use hash routing there.
// On the web it stays BrowserRouter for clean URLs.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const Router = isTauri ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
