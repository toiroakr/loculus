from pathlib import Path
from collections import defaultdict
import hashlib,json,math,statistics,argparse
root=Path(__file__).resolve().parents[2]
folder=root/'bench/coverage'
parser=argparse.ArgumentParser()
parser.add_argument('--input',default=str(folder/'settled-results.json'))
parser.add_argument('--output',default=str(folder/'significance-results.json'))
parser.add_argument('--source',default=str(root/'src/index.ts'))
parser.add_argument('--fixtures',default=str(folder/'fixtures.json'))
parser.add_argument('--modes')
args=parser.parse_args()
r=json.loads(Path(args.input).read_text())
assert r['completed'] and r['policy']['freshProcesses']>=9
assert r['environment']['sourceHash']==hashlib.sha256(Path(args.source).read_bytes()).hexdigest()
profiles=json.loads(Path(args.fixtures).read_text())['profiles']
by_id={p['id']:p for p in profiles}
modes=args.modes.split(',') if args.modes else r['policy'].get('modes', ['valid','invalid'] if r['policy']['scope'].startswith('compiled ') else ['valid','invalid','construct'])
assert modes and len(set(modes)) == len(modes) and set(modes) <= {'valid','invalid','construct'}

def exact_p(a,b):
    values=sorted([(v,0,i) for i,v in enumerate(a)]+[(v,1,i) for i,v in enumerate(b)])
    ranks=[];observed=0;i=0
    while i<len(values):
        j=i+1
        while j<len(values) and values[j][0]==values[i][0]:j+=1
        rank=i+j+1
        ranks.extend([rank]*(j-i))
        observed+=rank*sum(v[1]==0 for v in values[i:j])
        i=j
    dp=[defaultdict(int) for _ in range(len(a)+1)];dp[0][0]=1
    for rank in ranks:
        for count in range(len(a),0,-1):
            for score,n in list(dp[count-1].items()):dp[count][score+rank]+=n
    distribution=dp[len(a)];total=math.comb(len(values),len(a))
    lower=sum(n for score,n in distribution.items() if score<=observed)/total
    upper=sum(n for score,n in distribution.items() if score>=observed)/total
    return min(1,2*min(lower,upper))

def holm(rows,family_size):
    adjusted=0
    for i,row in enumerate(sorted(rows,key=lambda x:x['p'])):
        adjusted=max(adjusted,min(1,row['p']*(family_size-i)))
        row['adjustedP']=adjusted
        row['significant']=adjusted<=0.05
        row['practicalLoss']=row['significant'] and row['ratio']>=1.10
        row['practicalImprovement']=row['significant'] and row['ratio']<=1/1.10

peer=[];changes=[]
for c in r['cases'].values():
    if c['library']!='loculus' or c['version']!='after':continue
    for runtime in ['node','bun']:
        for mode in modes:
            current=c['runtime'][runtime][mode]
            for lib in ['zod','valibot','loculus']:
                if lib=='valibot' and by_id[c['id']].get('nativeValibot')==False:continue
                reference=next(entry for entry in r['cases'].values() if entry['id']==c['id'] and entry['library']==lib and entry['version']==('before' if lib=='loculus' else 'after'))['runtime'][runtime][mode]
                row={'id':c['id'],'runtime':runtime,'mode':mode,'reference':lib,'ns':current['median'],'referenceNs':reference['median'],'ratio':current['median']/reference['median'],'p':exact_p(current['processMedians'],reference['processMedians'])}
                (changes if lib=='loculus' else peer).append(row)
peer_family=sum(2 if p.get('nativeValibot')!=False else 1 for p in profiles)*2*len(modes)
change_family=len(profiles)*2*len(modes)
holm(peer,peer_family);holm(changes,change_family)
scope=r['policy']['scope'] if 'construct' in modes else r['policy']['scope'].split(';')[0]+'; repeated validation only; schema/code generation excluded from timing and evaluation'
report={'environment':r['environment'],'policy':{'test':'two-sided exact Mann–Whitney permutation test; tied ranks handled exactly','unit':'median of seven settled rounds from each independent process','alpha':0.05,'adjustment':'Holm, conservative family includes all original profiles and both runtimes, including unmeasured tests as p=1','modes':modes,'peerFamilySize':peer_family,'beforeAfterFamilySize':change_family,'practicalThreshold':0.10,'selection':sorted({c['id'] for c in r['cases'].values()}),'scope':scope,'rawReportSha256':hashlib.sha256(Path(args.input).read_bytes()).hexdigest(),'unmeasuredProfiles':'not asserted equivalent','caution':'results apply to this machine, versions, fixtures and harness; observational process repetitions do not remove systematic environment bias'},'peer':peer,'changes':changes,'completed':True}
Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for title,rows,flag in [('Remaining practical losses',peer,'practicalLoss'),('Practical improvements vs baseline',changes,'practicalImprovement')]:
    selected=sorted((row for row in rows if row[flag]),key=lambda x:x['ratio'],reverse=flag=='practicalLoss')
    print(title,len(selected))
    for row in selected:print(row['runtime'],row['id'],row['mode'],row['reference'],round(row['ns'],2),round(row['referenceNs'],2),round(row['ratio'],2),round(row['adjustedP'],4))
