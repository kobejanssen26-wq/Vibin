import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ConfirmProvider } from "./components/Confirm";
import { LangProvider } from "./lib/i18n";
import { App } from "./App";
import { installErrorTracking } from "./lib/track";
import "./index.css";

installErrorTracking();

const rootEl = document.getElementById("root")!;

function dismissBootShell() {
  const boot = document.getElementById("vibin-boot");
  if (!boot) return;
  boot.style.transition = "opacity 0.2s ease";
  boot.style.opacity = "0";
  boot.addEventListener("transitionend", () => boot.remove(), { once: true });
  // Hard fallback in case the transition never fires.
  window.setTimeout(() => boot.remove(), 600);
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
        <AuthProvider>
          <ConfirmProvider>
            <App onReady={dismissBootShell} />
          </ConfirmProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA service worker (production only). Registers, checks for an update on
// every load, and when a new worker takes control, reloads once so the tab
// isn't left running a stale build.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.update().catch(() => {});
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage("skipWaiting");
            }
          });
        });
      })
      .catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
