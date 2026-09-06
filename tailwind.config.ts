import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mingo brand palette
        ink: {
          DEFAULT: "#14101a",
          soft: "#211b2b",
          muted: "#6b6478",
        },
        paper: {
          DEFAULT: "#fdfbff",
          soft: "#f4f1f7",
        },
        coral: {
          50: "#fff1f2",
          100: "#ffe0e3",
          200: "#ffc2c9",
          300: "#ff97a3",
          400: "#ff6178",
          500: "#ff2d55",
          600: "#eb1042",
          700: "#c60936",
          800: "#a30b32",
          900: "#870f31",
        },
        tangerine: {
          400: "#ff9f45",
          500: "#ff7a1a",
          600: "#f25c00",
        },
        grape: {
          400: "#a970ff",
          500: "#8b3dff",
          600: "#7420f0",
          700: "#5f13c9",
        },
      },
      fontFamily: {
        sans: ['"Poppins"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        card: "0 20px 60px -20px rgba(20, 16, 26, 0.35)",
        pop: "0 10px 40px -12px rgba(255, 45, 85, 0.45)",
      },
      backgroundImage: {
        "mingo-gradient":
          "linear-gradient(135deg, #ff2d55 0%, #ff7a1a 48%, #8b3dff 100%)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "float-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        "float-up": "float-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
