import type { Config } from "tailwindcss";

/**
 * VIBIN design tokens.
 *
 * Brand palette (do not introduce another primary):
 *   VIBIN Blue  #3155FF  — primary actions, links, active states
 *   VIBIN Lime  #B8F23D  — accent only: matches, success, badges, highlights
 *   Deep Navy   #101426  — primary text, headings, dark surfaces
 *   Soft White  #F7F8FC  — primary light background
 *
 * The same values are mirrored as CSS custom properties in index.css so
 * non-Tailwind code (canvas, inline SVG) can read them.
 */
export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- brand primary: VIBIN Blue ---
        brand: {
          50: "#eef1ff",
          100: "#dfe4ff",
          200: "#c4ccff",
          300: "#9da9ff",
          400: "#6f80ff",
          500: "#3155ff", // VIBIN Blue
          600: "#2440e6",
          700: "#1c33bd",
          800: "#1a2f97",
          900: "#1a2c78",
        },
        // --- accent: VIBIN Lime ---
        lime: {
          50: "#f6fde8",
          100: "#eafbc7",
          200: "#dcf79b",
          300: "#c9f166",
          400: "#b8f23d", // VIBIN Lime
          500: "#9bd91f",
          600: "#79ad14",
          700: "#5c8314",
          800: "#4a6717",
          900: "#3f5718",
        },
        // --- Deep Navy: text + dark surfaces ---
        navy: {
          DEFAULT: "#101426",
          900: "#101426",
          800: "#1b2138",
          700: "#28304c",
          600: "#3a4468",
          500: "#5b6488",
          400: "#8b93b0",
          300: "#b9bfd4",
        },
        // --- Soft White: light background ---
        paper: {
          DEFAULT: "#f7f8fc",
          card: "#ffffff",
          soft: "#eef0f7",
          line: "#e2e5f0",
        },
        // --- functional (not brand) colours: errors + warnings ---
        danger: {
          50: "#fef2f2",
          100: "#fee2e2",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        amber: {
          50: "#fffbeb",
          100: "#fef3c7",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        card: "0 18px 48px -18px rgba(16, 20, 38, 0.28)",
        pop: "0 14px 40px -12px rgba(49, 85, 255, 0.45)",
        lime: "0 14px 40px -12px rgba(184, 242, 61, 0.5)",
        focus: "0 0 0 3px rgba(49, 85, 255, 0.35)",
      },
      backgroundImage: {
        "vibin-blue": "linear-gradient(135deg, #3155ff 0%, #5b6bff 55%, #6f80ff 100%)",
        "vibin-hero":
          "radial-gradient(1200px 600px at 12% -10%, rgba(49,85,255,0.16), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(184,242,61,0.16), transparent 55%)",
        "vibin-match":
          "linear-gradient(160deg, #101426 0%, #1c2a6b 55%, #3155ff 100%)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.86)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "float-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(24px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "avatar-in": {
          "0%": { transform: "translateY(14px) scale(0.6)", opacity: "0" },
          "70%": { transform: "translateY(-3px) scale(1.06)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "lime-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-12deg)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "translateX(120%) skewX(-12deg)", opacity: "0" },
        },
        "ring-pulse": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "bar-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both",
        "float-up": "float-up 0.32s ease-out both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "avatar-in": "avatar-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "lime-sweep": "lime-sweep 0.9s ease-out both",
        "ring-pulse": "ring-pulse 1.4s ease-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
