from pathlib import Path
from collections import defaultdict
import ast,hashlib,json,math
source=Path('bench/coverage/significance.py').read_text()
functions=[node for node in ast.parse(source).body if isinstance(node,ast.FunctionDef) and node.name in ('exact_p','holm')]
exec(compile(ast.Module(body=functions,type_ignores=[]),'shared-statistics','exec'))
path=Path('bench/build-time/object-diagnosis-results.json')
r=json.loads(path.read_text())
assert r['completed'] and r['policy']['freshProcesses']==9
contrasts=[('strict-loculus-no-freeze','strict-loculus'),('strict-valibot-copy-freeze-own','strict-valibot'),('strict-loculus','strict-valibot-copy-freeze-own'),('wide-loculus-no-own','wide-loculus'),('wide-valibot-own','wide-valibot'),('wide-loculus-fused','wide-loculus'),('wide-loculus-fused','wide-valibot')]
rows=[]
for current,reference in contrasts:
    for runtime in ('node','bun'):
        for mode in ('construct','valid'):
            a=r['cases'][current]['runtime'][runtime][mode]
            b=r['cases'][reference]['runtime'][runtime][mode]
            rows.append({'current':current,'reference':reference,'runtime':runtime,'mode':mode,'ns':a['median'],'referenceNs':b['median'],'ratio':a['median']/b['median'],'p':exact_p(a['processMedians'],b['processMedians'])})
holm(rows,len(rows))
report={'completed':True,'policy':{'test':'Two-sided exact Mann-Whitney with tied ranks; Holm over all 28 declared diagnostic contrasts; 10% practical threshold','familySize':len(rows),'rawReportSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'scope':'Some ablations weaken contracts; fused variant is a fixed-workload prototype, not the shipped plugin.'},'rows':rows}
Path('bench/build-time/object-diagnosis-statistics.json').write_text(json.dumps(report,indent=2)+'\n')
for row in rows:
    if row['current']=='wide-loculus-fused':print(row['runtime'],row['mode'],row['reference'],round(row['ns']),round(row['referenceNs']),row['practicalImprovement'],round(row['adjustedP'],4))
