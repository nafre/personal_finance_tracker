import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand gradient endpoints — keep in sync with any inline gradients
        brand: {
          DEFAULT: "#4f46e5", // indigo-600
          light: "#6366f1",   // indigo-500
          violet: "#7c3aed",  // violet-600
        },
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "slide-up": "slideUp 0.2s ease-out",
        "fade-out": "fadeOut 0.15s ease-in forwards",
        "fade-out-down": "fadeOutDown 0.2s ease-in forwards",
        "scale-in": "scaleIn 0.2s ease-out",
        "slide-down-in": "slideDownIn 0.2s ease-out",
        "row-highlight": "rowHighlight 1.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        fadeOutDown: {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(8px)", opacity: "0" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideDownIn: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // Slide-in + brand-tint flash for a just-added list row (single
        // keyframe because two animate-* classes would overwrite each other)
        rowHighlight: {
          "0%": { transform: "translateY(6px)", opacity: "0", backgroundColor: "rgba(99,102,241,0.16)" },
          "20%": { transform: "translateY(0)", opacity: "1", backgroundColor: "rgba(99,102,241,0.16)" },
          "100%": { transform: "translateY(0)", opacity: "1", backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
