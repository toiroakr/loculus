from pathlib import Path
from collections import defaultdict, Counter
import ast
import hashlib
import json
import math

root = Path(__file__).resolve().parents[2]
folder = root / 'bench/optimization-3'
source_hash = hashlib.sha256((root / 'src/index.ts').read_bytes()).hexdigest()
proof = json.loads((folder / 'ordinary-worker-equivalence.json').read_text())
assert proof['completed'] and proof['sourceHash'] == source_hash
tree = ast.parse((root / 'bench/coverage/significance.py').read_text())
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('exact_p', 'holm')]
assert len(functions) == 2
namespace = {'defaultdict': defaultdict, 'math': math}
exec(compile(ast.Module(body=functions, type_ignores=[]), 'existing-significance-functions', 'exec'), namespace)

def read_report(name):
    path = folder / (name + '.json')
    report = json.loads(path.read_text())
    assert report['completed'] and report['policy']['freshProcesses'] >= 9
    if report['environment']['sourceHash'] != source_hash:
        evidence = proof['reports'][name]
        assert evidence['measuredSourceHash'] == report['environment']['sourceHash']
        assert evidence['reportHash'] == hashlib.sha256(path.read_bytes()).hexdigest()
    return report

result = {
    'sourceHash': source_hash,
    'policy': {
        'scope': 'Post-hoc comparison of existing ordinary and compiled runs; no new timings',
        'method': 'Existing exact tied-rank Mann–Whitney plus Holm, 10% practical threshold',
        'families': 'All eligible schemas x two runtimes x two repeated validation operations, separate for canonical49, RHF3 and mixed3; construction excluded',
        'caution': 'Separate scope runs occurred at different times; process tests do not remove systematic environment bias. This analysis is descriptive/exploratory, not an independently predeclared confirmation.',
    },
    'groups': {},
    'completed': False,
}
for prefix, group in [('', 'canonical49'), ('supplement-', 'rhf3'), ('mixed-', 'mixed3')]:
    normal = read_report(prefix + 'settled-results')
    compiled = read_report(prefix + 'compiled-settled-results')
    current = [c for c in compiled['cases'].values() if c['library'] == 'loculus' and c['version'] == 'after']
    rows = []
    for c in current:
        n = next(n for n in normal['cases'].values() if n['library'] == 'loculus' and n['version'] == 'after' and n['id'] == c['id'])
        for runtime in ['node', 'bun']:
            for mode in ['valid', 'invalid']:
                a, b = c['runtime'][runtime][mode], n['runtime'][runtime][mode]
                rows.append({'id': c['id'], 'runtime': runtime, 'mode': mode, 'compiledNs': a['median'], 'normalNs': b['median'], 'ratio': a['median']/b['median'], 'p': namespace['exact_p'](a['processMedians'], b['processMedians'])})
    namespace['holm'](rows, len(rows))
    summary = []
    for runtime in ['node', 'bun']:
        for mode in ['valid', 'invalid']:
            subset = [r for r in rows if r['runtime'] == runtime and r['mode'] == mode]
            counts = Counter('slower' if r['practicalLoss'] else 'faster' if r['practicalImprovement'] else 'uncertain' for r in subset)
            summary.append({'runtime': runtime, 'mode': mode, 'total': len(subset), **{k: counts[k] for k in ['slower','faster','uncertain']}})
    result['groups'][group] = {'normalDate': normal['environment']['date'], 'compiledDate': compiled['environment']['date'], 'familySize': len(rows), 'summary': summary, 'comparisons': rows}
    print(group, summary)
result['completed'] = True
assert source_hash == hashlib.sha256((root / 'src/index.ts').read_bytes()).hexdigest()
(folder / 'compile-vs-normal-results.json').write_text(json.dumps(result, indent=2) + '\n')
