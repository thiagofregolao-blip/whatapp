import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        // Stitch design tokens
        "surface": "#0b1326",
        "surface-container": "#171f33",
        "surface-container-low": "#131b2e",
        "surface-container-high": "#222a3d",
        "surface-container-highest": "#2d3449",
        "surface-container-lowest": "#060e20",
        "surface-variant": "#2d3449",
        "on-surface": "#dae2fd",
        "on-surface-variant": "#bbcbb9",
        "on-background": "#dae2fd",
        "outline-variant": "#3c4a3d",
        "on-primary-container": "#005523",
        "primary-container": "#25d366",
        "surface-tint": "#3de273",
        "error": "#ffb4ab",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        "tertiary": "#99e1d4",
        "warning": "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        headline: ["Inter", "system-ui", "sans-serif"],
        label: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
      },
    },
  },
  plugins: [],
};
export default config;
