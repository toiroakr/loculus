import { spawnSync } from 'node:child_process';
const steps = [
  ['node', 'bench/single-use/prepare.mjs'],
  ['node', 'bench/single-use/prepare.generated.mjs'],
  ['node', 'bench/single-use/prepare.generated.mjs', '--baseline'],
  ['node', 'bench/single-use/verify.mjs'],
  ['node', 'bench/coverage/settled.mjs', '--workers-dir=bench/single-use/generated', '--before-dir=bench/single-use/generated/before', '--baseline-source=bench/single-use/before/index.ts.txt', '--output=bench/single-use/settled-results.json', '--modes=construct'],
  ['python3', 'bench/coverage/significance.py', '--input=bench/single-use/settled-results.json', '--output=bench/single-use/significance-results.json', '--fixtures=bench/single-use/fixtures.json', '--modes=construct'],
  ['node', 'bench/single-use/bundle.mjs'],
];
for (const [command, ...args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
