import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    // The red wedge world keeps corners nearly square; old screens inherit it through these sizes.
    extend: { borderRadius: { md: '2px', lg: '3px', xl: '3px', '2xl': '4px', '3xl': '4px' } },
  },
  plugins: [],
};

export default config;
