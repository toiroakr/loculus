from pathlib import Path
import subprocess,json
folder=Path(__file__).resolve().parent
root=folder.parents[1]
subprocess.run(['python3',str(root/'bench/coverage/significance.py'),'--input='+str(folder/'settled-results.json'),'--output='+str(folder/'significance-results.json'),'--fixtures='+str(folder/'timed-fixtures.json'),'--modes=construct,valid,invalid'],check=True)
path=folder/'significance-results.json'
r=json.loads(path.read_text())
comparison=json.loads((folder/'comparability-results.json').read_text())
assert comparison['completed']
by_id={c['id']:c for c in comparison['cases']}
excluded=[];remaining=[]
for row in r['peer']:
    if row['mode']=='invalid' and not by_id[row['id']]['peers'][row['reference']]['sameRejection']:
        excluded.append(row)
    else:remaining.append(row)
r['peer']=remaining
r['excludedIncompatibleInvalid']=excluded
r['policy']['invalidComparability']='Peer claims require matching acceptance/rejection for every timed invalid input. Error counts/formats may differ. Holm adjusted p-values retain the original conservative full family.'
path.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('Excluded incompatible invalid comparisons:',len(excluded))
print('Remaining significant practical losses:',sum(row['practicalLoss'] for row in remaining))
