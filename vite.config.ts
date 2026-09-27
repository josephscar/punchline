import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → static site in dist/ (deployable anywhere).
// `npm run build:single` → one self-contained HTML file in dist-single/.
// `npm run build:demo` → the same single file, flagged as an online preview
//   where the host page blocks downloads (dist-demo/).
export default defineConfig(({ mode }) => {
  const singleFile = mode === 'single' || mode === 'demo';
  return {
  base: './',
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  plugins: singleFile ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : singleFile ? 'dist-single' : 'dist',
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
    // React + ProseMirror make one ~500 kB chunk; jsPDF is split out and loaded on demand.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  };
});
