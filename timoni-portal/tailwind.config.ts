import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ["14px", { lineHeight: "1.5" }],
        sm: ["16px", { lineHeight: "1.5" }],
        base: ["18px", { lineHeight: "1.5" }],
        lg: ["20px", { lineHeight: "1.4" }],
        xl: ["24px", { lineHeight: "1.35" }],
        "2xl": ["28px", { lineHeight: "1.3" }],
        "3xl": ["32px", { lineHeight: "1.25" }],
      },
    },
  },
  plugins: [],
};

export default config;
