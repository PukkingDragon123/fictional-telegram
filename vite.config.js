import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> regular multi-file build in dist/
// `npm run build:single` -> one self-contained HTML file in dist-single/
// `npm run build:demo` -> the demo (src/demo/demo.js), one file in dist-demo/ [v26 demo]
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'; // [v26 demo]
  const single = mode === 'single' || demo;
  return {
    base: './',
    plugins: single ? [viteSingleFile(), ...(demo ? [demoTitle()] : [])] : [],
    build: {
      outDir: demo ? 'dist-demo' : single ? 'dist-single' : 'dist',
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
      assetsInlineLimit: single ? 100000000 : 4096,
    },
  };
});

// [v26 demo] the demo's page title
function demoTitle() {
  return { name: 'tbme-demo-title', transformIndexHtml: (html) => html.replace(/<title>([^<]*)<\/title>/, '<title>$1 (Demo)</title>') };
}
