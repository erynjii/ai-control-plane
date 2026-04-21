import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      colors: {
        canvas: {
          base: "#0B1120",
          rail: "#0F1629",
          card: "#141B2D",
          input: "#1A2236",
          hover: "#1E2A3F",
          active: "#1A2744"
        },
        line: {
          soft: "#1E293B",
          strong: "#334155"
        },
        ink: {
          100: "#F1F5F9",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B"
        },
        accent: {
          primary: "#3B82F6",
          cyan: "#22D3EE"
        },
        signal: {
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444"
        }
      }
    }
  },
  plugins: []
};

export default config;
