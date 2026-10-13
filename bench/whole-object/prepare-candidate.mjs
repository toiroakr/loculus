import {readFileSync,writeFileSync} from 'node:fs';
let source=readFileSync('bench/whole-object/prepare.generated.mjs','utf8');
source=source.replace("'../../dist/rolldown.js'","'./array-plugin-experiment.js'");
source=source.replaceAll("hash('src/rolldown.ts')","hash('bench/whole-object/array-plugin-experiment.ts')");
source=source.replaceAll('bench/whole-object/generated','bench/whole-object/generated/candidate');
source=source.replaceAll('bench/whole-object/bundle-results.json','bench/whole-object/candidate-bundle-results.json');
source=source.replaceAll('bench/whole-object/fixtures.json','bench/whole-object/candidate-fixtures.json');
writeFileSync('bench/whole-object/prepare-candidate.generated.mjs',source);
