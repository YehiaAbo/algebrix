# Algebrix desktop

The web build (`npm run build` at the root, one file: `dist/index.html`) in its own window.

- Try it: `npm run build` at the root, copy `dist/index.html` to `desktop/app/index.html`, then here `npm install && npm start`.
- Installers: `npm run dist` (on a Mac for the .dmg, on Windows for the .exe). GitHub builds both on every push of the
  working branch: see the "Desktop app" workflow's artifacts.
- Unsigned: the first open on a Mac needs right click > Open (or System Settings > Privacy & Security > Open Anyway);
  on Windows, "More info" > "Run anyway".
