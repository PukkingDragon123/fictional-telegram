import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Pukking's portfolio site (portfolio/): a static page that reuses the game's
// classroom, chalkboard and fox rig from src/.
//   npm run dev:portfolio     -> http://127.0.0.1:5174/
//   npm run build:portfolio   -> dist-portfolio/ (drop the folder on any static host / zip it for itch.io)
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('./portfolio'),
  base: './',
  publicDir: false,
  server: { port: 5174, host: '127.0.0.1', fs: { allow: [here('.')] } },
  build: {
    outDir: here('./dist-portfolio'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    // pictures are embedded in the script (nothing to fail to load on odd static hosts);
    // videos and fonts stay separate files
    assetsInlineLimit: (file) => (/\.(jpe?g|png)$/i.test(file) ? true : undefined),
  },
});
