import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoName = 'ymtd-accounting-app';

// GitHub Pages serves this as a project site under /ymtd-accounting-app/,
// but Netlify (and most other static hosts) serve from the domain root —
// `NETLIFY` is set automatically in Netlify's build environment, no manual
// config needed on their end.
const isNetlify = process.env.NETLIFY === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: isNetlify ? '/' : `/${repoName}/`,
});
