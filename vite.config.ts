import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [viteSingleFile()],
  // property tests type thousands of inputs a keystroke at a time: give them room
  test: { globals: true, include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
