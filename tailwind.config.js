/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        notion: {
          bg: '#ffffff',
          'bg-hover': '#f7f7f5',
          'bg-sidebar': '#f7f7f5',
          border: '#e8e8e5',
          text: '#37352f',
          'text-secondary': '#787774',
          'text-placeholder': '#b4b4b0',
          accent: '#2383e2',
          'accent-hover': '#1b6ec2',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans SC', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
