import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  deps: { neverBundle: ['rolldown'] },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: false,
  tsconfig: 'tsconfig.json',
});
