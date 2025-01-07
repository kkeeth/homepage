import { defineConfig } from 'vite';
import riot from 'rollup-plugin-riot';
import path from 'node:path';

export default defineConfig({
  root: process.cwd(),
  plugins: [riot()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@services': path.resolve(__dirname, 'src/services'),
    },
  },
  optimizeDeps: {
    include: ['@shoelace-style/shoelace/dist/themes/light.css'],
  },
  build: {
    outDir:
      'docs' /** https://vitejs.dev/config/build-options.html#build-outdir */,
    minify:
      'esbuild' /** https://vitejs.dev/config/build-options.html#build-minify */,
    target:
      'esnext' /** https://vitejs.dev/config/build-options.html#build-target */,
  },
});
