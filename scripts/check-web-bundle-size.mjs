#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'apps', 'web', 'dist', 'assets');

const reportOnly = process.argv.includes('--report-only');
const entryBudgetKb = Number(process.env.FINCHERRY_WEB_ENTRY_BUDGET_KB ?? 340);
const chunkBudgetKb = Number(process.env.FINCHERRY_WEB_CHUNK_BUDGET_KB ?? 420);

if (!fs.existsSync(assetsDir)) {
  console.error('Bundle check failed: apps/web/dist/assets not found.');
  console.error('Run `pnpm --filter @fincherry/web build` first.');
  process.exit(1);
}

const jsChunks = fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    const sizeBytes = fs.statSync(fullPath).size;
    return {
      name,
      sizeBytes,
      sizeKb: sizeBytes / 1024,
      isEntry: /^index-[^.]+\.js$/.test(name),
    };
  })
  .sort((a, b) => b.sizeBytes - a.sizeBytes);

if (jsChunks.length === 0) {
  console.error('Bundle check failed: no JS chunks found in apps/web/dist/assets.');
  process.exit(1);
}

const entryChunk = jsChunks.find((chunk) => chunk.isEntry) ?? null;
const largestChunk = jsChunks[0];

console.log('Web bundle size report (minified, uncompressed):');
for (const chunk of jsChunks.slice(0, 10)) {
  const marker = chunk.isEntry ? ' (entry)' : '';
  console.log(`  - ${chunk.name}: ${chunk.sizeKb.toFixed(2)} kB${marker}`);
}
console.log(`  - Total JS chunks: ${jsChunks.length}`);

if (!entryChunk) {
  console.warn('No entry chunk matching `index-*.js` was found.');
}

let failed = false;
if (entryChunk && entryChunk.sizeKb > entryBudgetKb) {
  failed = true;
  console.error(
    `Entry chunk budget exceeded: ${entryChunk.sizeKb.toFixed(2)} kB > ${entryBudgetKb.toFixed(2)} kB`,
  );
}

if (largestChunk.sizeKb > chunkBudgetKb) {
  failed = true;
  console.error(
    `Largest chunk budget exceeded: ${largestChunk.name} ${largestChunk.sizeKb.toFixed(2)} kB > ${chunkBudgetKb.toFixed(2)} kB`,
  );
}

if (failed && !reportOnly) {
  console.error('Bundle budget check failed.');
  console.error('You can inspect all chunks with `pnpm web:bundle:report`.');
  console.error('Temporary override via env vars:');
  console.error('  FINCHERRY_WEB_ENTRY_BUDGET_KB=<value>');
  console.error('  FINCHERRY_WEB_CHUNK_BUDGET_KB=<value>');
  process.exit(1);
}

if (failed && reportOnly) {
  console.log('Budget thresholds exceeded (report-only mode).');
  process.exit(0);
}

console.log('Bundle budget check passed.');
