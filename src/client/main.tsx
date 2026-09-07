import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ConfirmProvider } from "./components/Confirm";
import { App } from "./App";
import "./index.css";

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
      <AuthProvider>
        <ConfirmProvider>
          <App onReady={dismissBootShell} />
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA service worker (production only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
