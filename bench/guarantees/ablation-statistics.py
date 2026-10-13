from pathlib import Path
from collections import defaultdict
import ast,hashlib,json,math

root=Path(__file__).resolve().parents[2]
folder=root/'bench/guarantees'
functions=[n for n in ast.parse((root/'bench/coverage/significance.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name in ('exact_p','holm')]
exec(compile(ast.Module(body=functions,type_ignores=[]),'shared-statistics','exec'))
manifest=json.loads((folder/'ablation-manifest.json').read_text())
result=json.loads((folder/'ablation-results.json').read_text())
assert result['completed'] and result['policy']['freshProcesses']==11
assert result['environment']['manifestHash']==hashlib.sha256((folder/'ablation-manifest.json').read_bytes()).hexdigest()
assert manifest['sourceHash']==hashlib.sha256((root/'src/index.ts').read_bytes()).hexdigest()
assert manifest['pluginHash']==hashlib.sha256((root/'packages/rolldown/src/index.ts').read_bytes()).hexdigest()
def lookup(c):
    return result['cases'][result['aliases'].get(c['id'],c['id'])]
def row(current,reference,runtime,mode):
    a=lookup(current)['runtime'][runtime][mode]
    b=lookup(reference)['runtime'][runtime][mode]
    return {'id':current['id'],'profile':current['profile'],'pipeline':current['pipeline'],'variant':current['variant'],'topic':current['topic'],'reference':reference['id'],'runtime':runtime,'mode':mode,'ns':a['median'],'referenceNs':b['median'],'savedNs':b['median']-a['median'],'ratio':a['median']/b['median'],'sameExecutable':current['hash']==reference['hash'],'p':exact_p(a['processMedians'],b['processMedians'])}
changes=[];peers=[]
for c in manifest['cases']:
    if c['pipeline'] not in ('ordinary','generated'):continue
    for runtime in ('node','bun'):
        for mode in ('construct','valid','invalid'):
            if c['variant']!='baseline':
                base=next(x for x in manifest['cases'] if x['profile']==c['profile'] and x['pipeline']==c['pipeline'] and x['variant']=='baseline')
                changes.append(row(c,base,runtime,mode))
            if c['profile']!='enum-metadata':
                for lib in ('zod','valibot'):
                    base=next(x for x in manifest['cases'] if x['profile']==c['profile'] and x['pipeline']==lib)
                    peers.append(row(c,base,runtime,mode))
holm(changes,len(changes));holm(peers,len(peers))
def median(values):return sorted(values)[len(values)//2]
cold=json.loads((folder/'ablation-cold.json').read_text())
cold_rows=[]
for runtime in ('node','bun'):
    a=[(v['firstNs']+v['secondNs'])/2 for v in cold['cases'][runtime+'/literal-validator-cache']]
    b=[(v['firstNs']+v['secondNs'])/2 for v in cold['cases'][runtime+'/baseline']]
    cold_rows.append({'runtime':runtime,'ns':median(a),'referenceNs':median(b),'ratio':median(a)/median(b),'p':exact_p(a,b)})
holm(cold_rows,len(cold_rows))
types=json.loads((folder/'ablation-types.json').read_text())
type_rows=[]
for current in types['cases']:
    if current['variant']!='readonly':continue
    base=next(c for c in types['cases'] if c['profile']==current['profile'] and c['variant']=='baseline')
    a=[v['checkSeconds'] for v in current['samples']];b=[v['checkSeconds'] for v in base['samples']]
    type_rows.append({'profile':current['profile'],'seconds':median(a),'referenceSeconds':median(b),'ratio':median(a)/median(b) if median(b)>0 else 1,'p':exact_p(a,b),'instantiationDelta':current['instantiations']-base['instantiations']})
holm(type_rows,len(type_rows))
output={'completed':True,'environment':result['environment'],'policy':{'test':'Two-sided exact Mann-Whitney with tied ranks; Holm separately over all predeclared variant/baseline contrasts and all variant/peer contrasts; process median is statistical unit. Practical improvement: at least 1.1x speedup, adjusted p <= .05; loss: at least 1.1x slower.','changeFamilySize':len(changes),'peerFamilySize':len(peers),'coldFamilySize':len(cold_rows),'typeFamilySize':len(type_rows),'freshProcesses':11,'sameExecutable':'Identical worker hashes use the same measured samples; this is code identity, not an equivalence test.','metadataPeerExcluded':'The enum-metadata case measures Loculus metadata access; peers expose different metadata, so no peer speed claim.','rawReportHash':hashlib.sha256((folder/'ablation-results.json').read_bytes()).hexdigest()},'changes':changes,'peers':peers,'cold':cold_rows,'types':type_rows}
(folder/'ablation-statistics.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
for v in manifest['variants'][1:]:
    selected=[r for r in changes if r['variant']==v['id']]
    print(v['id'],'improvements',sum(r['practicalImprovement'] for r in selected),'losses',sum(r['practicalLoss'] for r in selected),'identical',sum(r['sameExecutable'] for r in selected))
