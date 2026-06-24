/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ecr: {
          dark:    '#37423f',
          darker:  '#2a3330',
          darkest: '#1e2624',
          red:     '#d41f27',
          'red-hover': '#b81920',
          gray:    '#889893',
          'gray-light': '#b5c5c1',
          cream:   '#f0ede6',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
