import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
import {loculusPlugin} from '../../packages/rolldown/dist/index.js';

const dir=fileURLToPath(new URL('.',import.meta.url));
const bundle=await rolldown({input:dir+'schema.ts',plugins:[loculusPlugin()]});
try{
  await mkdir(dir+'generated',{recursive:true});
  await bundle.write({file:dir+'generated/schema.js',format:'esm',minify:true,sourcemap:true});
}finally{await bundle.close();}
const {query}=await import('./generated/schema.js');
assert.deepEqual(query['~standard'].validate({search:' hello ',page:'2',archived:'false'}),{
  value:{search:'hello',page:2,archived:false},
});
console.log('Generated and executed a standalone schema module.');
