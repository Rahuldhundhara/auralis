import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.AURALIS_DEV ? 'development' : 'production'),
  },
};

await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.js',
});

await build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.js',
});
