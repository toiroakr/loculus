import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=name=>JSON.parse(readFileSync('bench/whole-object/'+name+'.json'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const initial=read('settled-results'),candidate=read('candidate-settled-results');
const initialSizes=read('bundle-results'),currentSizes=read('current-bundle-results');
assert.ok(initial.completed&&candidate.completed&&currentSizes.completed);
assert.equal(initial.environment.sourceHash,hash('src/index.ts'));
assert.equal(candidate.environment.pluginHash,hash('src/rolldown.ts'));
assert.equal(currentSizes.pluginHash,hash('src/rolldown.ts'));
for(const name of ['settled-results','bundle-results','fixtures','timed-fixtures','significance-results'])copyFileSync('bench/whole-object/'+name+'.json','bench/whole-object/initial-'+name+'.json');
const replaced=[];
for(const [name,entry]of Object.entries(initial.cases)){
 const updated=candidate.cases[name];
 const currentFile=entry.file;
 if(updated){
  const measured=readFileSync(updated.file,'utf8');
  assert.equal(measured.replaceAll('bench/whole-object/generated/candidate/','bench/whole-object/generated/'),readFileSync(currentFile,'utf8'),name+' current worker must equal measured candidate except region filename comments');
  initial.cases[name]={...updated,file:currentFile,fixtureHash:hash(currentFile),measuredFixtureHash:updated.fixtureHash,measuredFile:updated.file,measuredPluginHash:candidate.environment.pluginHash};
  replaced.push(name);
 }else{
  assert.equal(entry.fixtureHash,hash(currentFile),name+' unchanged worker');
  entry.measuredPluginHash=initial.environment.pluginHash;
 }
 const library=entry.library==='loculus'?(entry.version==='before'?'ordinary':'generated'):entry.library;
 const consumer=currentSizes.cases.find(c=>c.id===entry.id).libraries[library];
 if(!updated)assert.equal(consumer.consumerHash,initialSizes.cases.find(c=>c.id===entry.id).libraries[library].consumerHash,name+' unchanged consumer');
}
initial.codegenReverification={pluginHash:hash('src/rolldown.ts'),measuredPluginHash:initial.environment.pluginHash,date:new Date().toISOString(),reason:'Static array specialization; all changed conditions remeasured in eleven fresh processes on both engines. All other executed worker bytes and minified consumer hashes unchanged.',replacedConditions:replaced,unchangedConditions:Object.keys(initial.cases).length-replaced.length,candidateRawSha256:hash('bench/whole-object/candidate-settled-results.json'),filenameCommentsOnly:true};
initial.policy.remeasurement=candidate.policy;
writeFileSync('bench/whole-object/settled-results.json',JSON.stringify(initial,null,2)+'\n');
copyFileSync('bench/whole-object/current-bundle-results.json','bench/whole-object/bundle-results.json');
console.log('Merged',replaced.length,'remeasured conditions;',initial.codegenReverification.unchangedConditions,'workers remain byte-identical.');
