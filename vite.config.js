import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'ymtd-accounting-app';

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
});
