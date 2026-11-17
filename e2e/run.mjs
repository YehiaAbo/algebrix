// Browser tests: start the dev server, drive the real app with the keyboard and mouse in
// Chromium, and check what happens. `npm run e2e` runs every *.e2e.mjs file here;
// `npm run e2e -- tours` runs only the files whose name contains "tours".
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { helpers } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] ?? '';

const server = await createServer({ root: join(here, '..'), server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
let failed = 0, passed = 0;
try {
  const files = (await readdir(here)).filter(f => f.endsWith('.e2e.mjs') && f.includes(only)).sort();
  for (const file of files) {
    const { tests } = await import(join(here, file));
    console.log(`\n${file}`);
    for (const [name, run] of Object.entries(tests)) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      const t0 = Date.now();
      try {
        const h = await helpers(page, url);
        await run(h);
        if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
        passed++;
        console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${name}\n      ${String(e.message ?? e).split('\n').join('\n      ')}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
