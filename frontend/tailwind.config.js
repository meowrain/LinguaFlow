/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Theme-aware semantic tokens. Prefer these over raw Tailwind color
        // families so palettes stay coordinated across all five themes.
        surface: {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)',
        },
        border: {
          DEFAULT: 'var(--border)',
        },
        muted: 'var(--muted)',
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
          soft: 'var(--accent-soft)',
          'soft-border': 'var(--accent-soft-border)',
          'soft-fg': 'var(--accent-soft-fg)',
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
          'soft-border': 'var(--success-soft-border)',
          'soft-fg': 'var(--success-soft-fg)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          'soft-border': 'var(--warning-soft-border)',
          'soft-fg': 'var(--warning-soft-fg)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
          'soft-border': 'var(--danger-soft-border)',
          'soft-fg': 'var(--danger-soft-fg)',
        },
      },
    },
  },
  plugins: [],
}
