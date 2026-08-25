#!/usr/bin/env node
/**
 * Regenerate dist/scroll-scrub-video.esm.js from the UMD source.
 *
 * The library itself needs no build step - this only exists so that the ES module
 * copy stays in sync after you edit dist/scroll-scrub-video.js.
 *
 *   node tools/build-esm.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'dist/scroll-scrub-video.js'), 'utf8');

const open = src.indexOf("'use strict';");
const close = src.lastIndexOf('return ScrollScrubVideo;');
if (open === -1 || close === -1) {
  console.error('Could not find the factory body - did the UMD wrapper change?');
  process.exit(1);
}

const body = src.slice(open + "'use strict';".length, close).trim();
const banner = src.slice(0, src.indexOf('*/') + 2);

const out = `${banner}
/* Generated from scroll-scrub-video.js by tools/build-esm.mjs - do not edit by hand. */

${body}

export default ScrollScrubVideo;
export { ScrollScrubVideo };
`;

writeFileSync(join(root, 'dist/scroll-scrub-video.esm.js'), out);
console.log('wrote dist/scroll-scrub-video.esm.js');
