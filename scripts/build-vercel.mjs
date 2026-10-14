// Produces Vercel's Build Output API v3 layout (https://vercel.com/docs/build-output-api/v3):
//   .vercel/output/static/                      the Vite build, served from the CDN
//   .vercel/output/functions/api.func/index.mjs  the whole API bundled into one file
//   .vercel/output/config.json                  routes and security headers
// Run after `vite build` (see the "build:vercel" npm script).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('.vercel/output');
const FUNC = path.join(OUT, 'functions/api.func');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FUNC, { recursive: true });
fs.cpSync('dist', path.join(OUT, 'static'), { recursive: true });

await build({
  entryPoints: ['server/vercel.js'],
  outfile: path.join(FUNC, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // pg-native is an optional native add-on pg never loads unless asked; PGlite is only used without DATABASE_URL.
  external: ['pg-native', '@electric-sql/pglite'],
  // Bundled CommonJS code still require()s Node built-ins; give the ES module a real require for those.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

fs.writeFileSync(path.join(FUNC, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  regions: ['pdx1'], // Portland, next to the Neon database in AWS us-west-2 (Oregon)
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
}, null, 2));

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/(.*)', headers: securityHeaders, continue: true },
    { src: '/api(?:/.*)?', dest: '/api' },
    { handle: 'filesystem' },
  ],
}, null, 2));

const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
console.log(`Vercel output ready: function ${kb(path.join(FUNC, 'index.mjs'))}, static files from dist/`);
