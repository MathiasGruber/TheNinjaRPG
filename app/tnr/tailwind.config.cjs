/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        fontasia: ["Fontasia", "Impact", "sans-serif"],
      },
    },
  },
  plugins: [],
};
