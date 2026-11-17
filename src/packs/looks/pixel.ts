// Pixel: a pixel font for the math and the interface, square corners, hard shadows,
// and sprite-like stepped motion.
import { LookPack } from '../types';

export const pixel: LookPack = {
  id: 'pixel',
  name: 'Pixel',
  blurb: 'Pixel font, square corners, stepped motion.',
  fonts: 'Pixelify+Sans:wght@400;500;600',
  easing: 'steps(7, end)',
  css: `
:root[data-look="pixel"] {
  --ui-font: "Pixelify Sans", ui-monospace, monospace;
  --math-font: "Pixelify Sans", ui-monospace, monospace;
  --ease: steps(5, end);
}
:root[data-look="pixel"] *, :root[data-look="pixel"] *::before, :root[data-look="pixel"] *::after { border-radius: 0 !important; }
:root[data-look="pixel"] .desk, :root[data-look="pixel"] .graph-wrap, :root[data-look="pixel"] .help-card,
:root[data-look="pixel"] .lib-card, :root[data-look="pixel"] .panel-card { box-shadow: 0 0 0 2px var(--line), 5px 5px 0 var(--line); }
:root[data-look="pixel"] .sel { box-shadow: none; outline: 2px dashed var(--sel); outline-offset: 0; }
:root[data-look="pixel"] .g.text.it { font-style: normal; }
:root[data-look="pixel"] .g svg path, :root[data-look="pixel"] svg.g path { shape-rendering: crispEdges; }
:root[data-look="pixel"] kbd { box-shadow: 0 2px 0 var(--key-edge); }
`,
};
