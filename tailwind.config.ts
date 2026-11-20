import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F2ED",
        surface: "#FFFFFF",
        ink: "#182329",
        muted: "#52616B",
        action: "#3559E0",
        market: "#718394",
        compare: "#C57A36",
        good: "#237457",
        bad: "#B13C47",
        line: "#DEDCD5",
      },
      fontFamily: {
        sans: ["Thesis Sans", "system-ui", "sans-serif"],
        serif: ["Thesis Serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(24 35 41 / 4%), 0 6px 20px rgb(24 35 41 / 5%)",
        shell: "0 8px 32px rgb(24 35 41 / 10%)",
        fab: "0 8px 24px rgb(24 35 41 / 14%)",
      },
    },
  },
  plugins: [],
};
export default config;
