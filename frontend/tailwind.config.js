/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      /* ── Custom color palette ──────────────────────────── */
      colors: {
        brand: {
          50:  "#e0f7ff",
          100: "#b3ecff",
          200: "#80dfff",
          300: "#4dd2ff",
          400: "#26c6ff",
          500: "#06b6d4",  /* primary cyan accent */
          600: "#0597b0",
          700: "#04768a",
          800: "#035566",
          900: "#013440",
        },
        surface: {
          950: "#050810",   /* deepest background */
          900: "#0a0e1a",   /* main background */
          800: "#111827",   /* card/panel background */
          700: "#1a2235",   /* elevated surface */
          600: "#243049",   /* hover state surface */
          500: "#2d3a56",   /* borders / dividers */
        },
        accent: {
          purple: "#8b5cf6",
          blue:   "#3b82f6",
          pink:   "#ec4899",
          amber:  "#f59e0b",
          green:  "#10b981",
          red:    "#ef4444",
        },
      },
      /* ── Typography ────────────────────────────────────── */
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
      /* ── Animation utilities ───────────────────────────── */
      animation: {
        "fade-in":     "fadeIn 0.3s ease-out",
        "slide-up":    "slideUp 0.3s ease-out",
        "slide-right": "slideRight 0.3s ease-out",
        "pulse-slow":  "pulse 3s ease-in-out infinite",
        "spin-slow":   "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideRight: {
          "0%":   { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      /* ── Glassmorphism backdrop blur values ─────────────── */
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
}
