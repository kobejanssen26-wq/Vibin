import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// Fade out the first-paint boot shell once React has painted.
requestAnimationFrame(() => {
  const boot = document.getElementById("vibin-boot");
  if (boot) {
    boot.style.transition = "opacity 0.25s ease";
    boot.style.opacity = "0";
    setTimeout(() => boot.remove(), 300);
  }
});

// PWA service worker (production only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
