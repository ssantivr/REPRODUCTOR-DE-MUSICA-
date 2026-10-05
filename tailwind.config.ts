import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Cascadia Code", "Consolas", "Menlo", "monospace"],
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateX(-30%)" },
          "50%": { transform: "translateX(130%)" },
        },
      },
      animation: {
        drift: "drift 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
