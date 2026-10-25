import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        red: "var(--red)",
        "red-bg": "var(--red-bg)",
        amber: "var(--amber)",
        "amber-bg": "var(--amber-bg)",
        green: "var(--green)",
        "green-bg": "var(--green-bg)",
      },
    },
  },
  plugins: [],
};
export default config;
