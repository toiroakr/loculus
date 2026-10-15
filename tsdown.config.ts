import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/length.ts'],
  deps: { alwaysBundle: ['string-width', 'get-east-asian-width', 'strip-ansi', 'ansi-regex'] },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: false,
  tsconfig: 'tsconfig.build.json',
});
