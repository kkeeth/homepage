import { defineConfig } from 'vite';
import riot from 'rollup-plugin-riot';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shoelaceAssetsDir = path.resolve(
  __dirname,
  'node_modules/@shoelace-style/shoelace/cdn/assets',
);

function shoelaceAssets() {
  return {
    name: 'shoelace-assets',
    configureServer(server) {
      server.middlewares.use('/shoelace/assets', (req, res, next) => {
        const urlPath = decodeURIComponent((req.url || '').split('?')[0]);
        const filePath = path.join(shoelaceAssetsDir, urlPath);
        if (!filePath.startsWith(shoelaceAssetsDir)) {
          res.statusCode = 403;
          return res.end();
        }
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) return next();
          if (filePath.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
          }
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
    closeBundle() {
      const dest = path.resolve(__dirname, 'docs/shoelace/assets');
      fs.cpSync(shoelaceAssetsDir, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  root: process.cwd(),
  plugins: [riot(), shoelaceAssets()],
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
