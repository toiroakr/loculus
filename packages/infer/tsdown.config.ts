import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  deps: { neverBundle: ['ts-morph', 'tinyglobby'] },
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: false,
  tsconfig: 'tsconfig.json',
});
