import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-aware: "white" is the ink (text, lines) and "black" the shade behind fields.
        // Both flip in the light theme, see the variables in globals.css
        white: "rgb(var(--ink) / <alpha-value>)",
        black: "rgb(var(--shade) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Cascadia Code", "Consolas", "Menlo", "monospace"],
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateX(-30%)" },
          "50%": { transform: "translateX(130%)" },
        },
        hop: {
          "0%, 100%": { opacity: "0" },
          "30%": { opacity: "1" },
        },
        equalize: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        drift: "drift 2.4s ease-in-out infinite",
        hop: "hop 0.6s ease-out both",
        equalize: "equalize 0.9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
