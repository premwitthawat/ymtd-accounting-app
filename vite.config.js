import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoName = 'ymtd-accounting-app';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: `/${repoName}/`,
});
