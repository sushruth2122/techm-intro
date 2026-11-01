import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// `vite build` makes the Tech Mahindra × Astrikos AI edition in dist/; `vite build --mode
// astrikos` makes the Astrikos-only edition in dist-astrikos/ (see src/edition.js).
export default defineConfig(({ mode }) => {
  const astrikos = mode === 'astrikos';
  return {
    // Relative URLs, so a build works from any folder (e.g. a Hostinger subdirectory).
    base: './',
    build: { outDir: astrikos ? 'dist-astrikos' : 'dist' },
    plugins: [edition(astrikos)],
  };
});

// index.html marks Tech Mahindra-only markup with <!-- techm --> … <!-- /techm -->.
function edition(astrikos) {
  let cfg;
  return {
    name: 'edition',
    configResolved(c) {
      cfg = c;
    },
    transformIndexHtml(html) {
      if (!astrikos) return html.replace(/[ \t]*<!-- \/?techm -->\n/g, '');
      return html
        .replace(/[ \t]*<!-- techm -->[\s\S]*?<!-- \/techm -->\n/g, '')
        .replace('<html lang="en">', '<html lang="en" data-edition="astrikos">')
        .replaceAll('Tech Mahindra × ', '')
        .replace('href="favicon.svg"', 'href="favicon-astrikos.svg"');
    },
    closeBundle() {
      // Each build ships only its own brand files.
      if (cfg.command !== 'build') return;
      const drop = astrikos ? ['brand/tech-mahindra.svg', 'brand/tech-mahindra-reversed.svg', 'favicon.svg'] : ['favicon-astrikos.svg'];
      for (const f of drop) rmSync(resolve(cfg.root, cfg.build.outDir, f), { force: true });
    },
  };
}
