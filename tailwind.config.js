/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 方案「和纸稿纸」色板：暖纸底色 + 单一墨色层级 + 琥珀/朱红点缀
        paper: {
          DEFAULT: '#faf6ee',
          deep: '#f3ede0',
        },
        ink: {
          DEFAULT: '#33302a',
          2: '#6b655a',
          3: '#a39a89',
        },
        hairline: '#e3dac7',
        seal: '#a8352a',
        // 兼容旧类名的语义别名（与和纸稿纸同色系）
        notion: {
          bg: '#faf6ee',
          'bg-hover': '#f3ede0',
          'bg-sidebar': '#f7f2e9',
          border: '#e3dac7',
          text: '#33302a',
          'text-secondary': '#6b655a',
          'text-placeholder': '#a39a89',
          accent: '#b07830',
          'accent-hover': '#8f5f1f',
        },
      },
      fontFamily: {
        sans: ['"LXGW WenKai Screen"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans SC', 'serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
