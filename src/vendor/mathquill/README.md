# MathQuill (vendored)

Desmos's fork of MathQuill (https://github.com/desmosinc/mathquill, commit bb9974a), the editor
Desmos types with. It no longer needs jQuery. Built here the way its Makefile builds it (the
sources concatenated, non-ASCII escaped, types stripped to ES5) and its LESS compiled with
`omit-font-face`, so it adds no font files: the fields use the app's math font.

Licence: Mozilla Public License 2.0 (see the header of mathquill.js). MPL is file-level: these two
files stay under it, the rest of the app is unaffected.

Only `src/ui/mathfield.ts` talks to it.
