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
          500: "#4c5578", // emphasis secondary text (AAA on Soft White)
          400: "#5e6789", // muted / metadata text — still AA on Soft White
          300: "#9aa1bd", // decorative only: borders, dividers, disabled
          200: "#c3c8db",
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
      /* Restrained, deliberate radius scale — no giant pill corners. */
      borderRadius: {
        lg: "0.5rem",
        xl: "0.625rem",
        "2xl": "0.75rem",
        "3xl": "1rem",
        "4xl": "1.25rem",
      },
      /* One quiet elevation. No coloured glows. */
      boxShadow: {
        card: "0 1px 2px rgba(16,20,38,0.04), 0 8px 24px -16px rgba(16,20,38,0.18)",
        pop: "0 1px 2px rgba(16,20,38,0.04), 0 8px 24px -16px rgba(16,20,38,0.18)",
        lime: "0 1px 2px rgba(16,20,38,0.04), 0 8px 24px -16px rgba(16,20,38,0.18)",
        focus: "0 0 0 3px rgba(49, 85, 255, 0.28)",
      },
      backgroundImage: {
        "vibin-blue": "linear-gradient(150deg, #3155ff 0%, #2a49df 100%)",
        "vibin-match": "linear-gradient(155deg, #101426 0%, #182353 60%, #24398f 100%)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "float-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "avatar-in": {
          "0%": { transform: "translateY(10px) scale(0.7)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "lime-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-12deg)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "translateX(120%) skewX(-12deg)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "enter-fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "float-up": "float-up 0.22s ease-out both",
        "slide-up": "slide-up 0.24s cubic-bezier(0.22, 1, 0.36, 1) both",
        "avatar-in": "avatar-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "lime-sweep": "lime-sweep 0.8s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "enter-fade": "enter-fade 0.2s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
