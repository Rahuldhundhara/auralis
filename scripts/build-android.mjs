import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const target = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html is missing. Run "npm run build:renderer" first.');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(dist, target, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'android', 'api-entry.ts')],
  outfile: path.join(target, 'android-api.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  sourcemap: false,
  minify: true,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

const indexPath = path.join(target, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const marker = '<script type="module"';
const tag = '<script src="./android-api.js"></script>\n    ';
if (!html.includes('android-api.js')) {
  if (!html.includes(marker)) {
    console.error('Could not find the renderer module script in dist/index.html.');
    process.exit(1);
  }
  fs.writeFileSync(indexPath, html.replace(marker, `${tag}${marker}`));
}

const required = ['index.html', 'android-api.js'];
for (const file of required) {
  if (!fs.existsSync(path.join(target, file))) {
    console.error(`Android web asset is missing: ${file}`);
    process.exit(1);
  }
}

console.log(`Android web assets ready: ${target}`);
