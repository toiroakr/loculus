from pathlib import Path
from collections import defaultdict
import json, math, statistics, hashlib
r=json.loads(Path('bench/optimization-4/valibot-ablation-results.json').read_text())
assert r['completed'] and r['freshProcesses']>=9
source=Path('bench/coverage/significance.py').read_text()
exec(source[source.index('def exact_p'):source.index('peer=[];changes=[]')])
rows=[]
for name,case in r['cases'].items():
    reference='valibot' if name.startswith('valibot') else 'loculus'
    if name==reference: continue
    for runtime in ['node','bun']:
        for mode in ['valid','invalid','construct']:
            a=case['runtime'][runtime][mode];b=r['cases'][reference]['runtime'][runtime][mode]
            rows.append(dict(variant=name,reference=reference,runtime=runtime,mode=mode,ns=statistics.median(a),referenceNs=statistics.median(b),ratio=statistics.median(a)/statistics.median(b),p=exact_p(a,b)))
holm(rows,len(rows))
report=dict(date=r['date'],sourceHashes=r['sourceHashes'],rawSha256=hashlib.sha256(Path('bench/optimization-4/valibot-ablation-results.json').read_bytes()).hexdigest(),policy=dict(method='two-sided exact Mann-Whitney, tied ranks, Holm across all 42 diagnostic contrasts, plus 10% threshold',familySize=len(rows),freshProcesses=r['freshProcesses'],scope='Diagnostic variants vs their own unmodified library; not the product peer-comparison suite; variants change contracts and are not shipped'),rows=rows,completed=True)
Path('bench/optimization-4/valibot-ablation-statistics.json').write_text(json.dumps(report,indent=2)+'\n')
for x in rows:
    if x['mode']=='construct': print(x['runtime'],x['variant'],round(x['ns'],2),round(x['referenceNs'],2),'loss' if x['practicalLoss'] else 'gain' if x['practicalImprovement'] else 'uncertain',round(x['adjustedP'],4))
