import { readFileSync } from 'node:fs';
export { libraries, imports, prelude } from '../coverage/fixtures.mjs';

const prefixes = ['l', 'z', 'v'];
const string = ['l.string({optional:true})', 'z.string().optional()', 'v.optional(v.string())'];
const requiredString = ['l.string()', 'z.string()', 'v.string()'];
const boolean = [
  'l.boolean({optional:true})',
  "z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')]).optional()",
  "v.optional(v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))]))",
];
const strings = [
  'l.array(l.string(),{wrapScalar:true,optional:true})',
  'z.union([z.array(z.string()),z.string().transform(x=>[x])]).optional()',
  'v.optional(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]))',
];
const integer = (min, max) => [
  `l.number({integer:true,gte:${min}${max === undefined ? '' : ',lte:' + max},optional:true})`,
  `z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().gte(${min})${max === undefined ? '' : '.lte(' + max + ')'}).optional()`,
  `v.optional(v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.finite(),v.safeInteger(),v.minValue(${min})${max === undefined ? '' : ',v.maxValue(' + max + ')'}))`,
];
const enumeration = values => [
  `l.enum(${JSON.stringify(values)},{optional:true})`,
  `z.enum(${JSON.stringify(values)}).optional()`,
  `v.optional(v.picklist(${JSON.stringify(values)}))`,
];
const flagDefault = fallback => [
  `l.boolean({default:${fallback}})`,
  boolean[1].replace('.optional()', `.default(${fallback})`),
  boolean[2].replace(/\)$/, `,${fallback})`),
];
const shape = entries => prefixes.map((prefix, i) => `${prefix}.${i === 0 ? 'object' : 'strictObject'}({${entries.map(([name, expressions]) => name + ':' + expressions[i]).join(',')}})`);
const stringFields = names => names.map(name => [name, string]);
const booleanFields = names => names.map(name => [name, boolean]);
const reference = JSON.parse(readFileSync(new URL('./cf-reference.json', import.meta.url)));
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const decimalNumber = [
  'l.number({optional:true})',
  'z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number()).optional()',
  'v.optional(v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.finite()))',
];
const cfFields = command => reference.commands.find(value => value.command === command).options.map(option => {
  if (Object.hasOwn(option, 'default')) {
    if (option.type !== 'boolean') throw Error('Unhandled default: ' + option.name);
    return [camel(option.name), flagDefault(option.default)];
  }
  const field = option.enum ? enumeration(option.enum) : option.type === 'boolean' ? boolean : option.type === 'number' ? decimalNumber : option.type === 'string' ? string : undefined;
  if (!field) throw Error('Unhandled option type: ' + option.name);
  return [camel(option.name), field];
});
const sources = {
  log: 'https://git-scm.com/docs/git-log',
  clone: 'https://git-scm.com/docs/git-clone',
  deploy: 'https://developers.cloudflare.com/cf/projects/#deploy',
  dns: 'https://developers.cloudflare.com/cf/get-started/resources/#list-dns-records',
};

const commands = [
  {
    id: 'git-log-strings', command: 'git log', source: sources.log,
    fields: stringFields(['since', 'until', 'format', 'date', 'encoding', 'output']),
    sparse: { format: '%h %s' },
    full: { since: '2026-01-01', until: '2026-10-01', format: '%h %an %s', date: 'iso', encoding: 'UTF-8', output: 'history.txt' },
    argv: ['git log --format="%h %s"', 'git log --since=2026-01-01 --until=2026-10-01 --format="%h %an %s" --date=iso --encoding=UTF-8 --output=history.txt'],
    badKey: 'format',
  },
  {
    id: 'git-clone', command: 'git clone', source: sources.clone,
    fields: [['repository', requiredString], ...stringFields(['directory', 'branch', 'origin', 'filter', 'template', 'shallowSince']), ['depth', integer(1)], ['jobs', integer(1)], ['shallowExclude', strings], ...booleanFields(['singleBranch', 'noCheckout', 'sparse', 'quiet'])],
    sparse: { repository: 'https://example.com/team/repo.git', depth: '1' },
    full: { repository: 'https://example.com/team/repo.git', directory: 'repo', branch: 'main', origin: 'upstream', filter: 'blob:none', template: './templates', depth: '100', jobs: '4', shallowExclude: ['archive', 'legacy'], singleBranch: true, noCheckout: true, sparse: true, quiet: true },
    argv: ['git clone --depth=1 https://example.com/team/repo.git', 'git clone --branch=main --origin=upstream --filter=blob:none --template=./templates --depth=100 --jobs=4 --shallow-exclude=archive --shallow-exclude=legacy --single-branch --no-checkout --sparse --quiet https://example.com/team/repo.git repo'],
    badKey: 'repository',
  },
  {
    id: 'cf-deploy', command: 'cf deploy', source: sources.deploy,
    fields: [...cfFields('cf deploy'), ['mode', string]],
    sparse: { mode: 'production' },
    full: { prebuilt: true, tag: 'v1.2.0', message: 'Fix header parsing', secretsFile: 'secrets.env', dryRun: true, worker: 'api-staging', provision: false, dispatchNamespace: 'platform', containersRollout: 'gradual', mode: 'staging' },
    argv: ['cf deploy --mode=production', 'cf deploy --prebuilt --tag=v1.2.0 --message="Fix header parsing" --secrets-file=secrets.env --dry-run --worker=api-staging --no-provision --dispatch-namespace=platform --containers-rollout=gradual --mode=staging'],
    defaults: { prebuilt: false, dryRun: false, provision: true }, badKey: 'message',
  },
  {
    id: 'cf-dns-records-list', command: 'cf dns records list', source: sources.dns,
    fields: [...cfFields('cf dns records list'), ['zone', string]],
    sparse: { zone: 'example.com', type: 'A' },
    full: { zone: 'example.com', nameContains: 'api', type: 'A', contentContains: '192.0.2.', proxied: true, match: 'all', commentContains: 'release', tagPresent: 'owner', tagExact: 'owner:dns', tagMatch: 'all', page: '2', perPage: '100', order: 'name', direction: 'asc', includeShadowMetadata: true, shadowedByName: 'dev.example.com', dryRun: true },
    argv: ['cf dns records list --zone=example.com --type=A', 'cf dns records list --zone=example.com --name-contains=api --type=A --content-contains=192.0.2. --proxied --match=all --comment-contains=release --tag-present=owner --tag-exact=owner:dns --tag-match=all --page=2 --per-page=100 --order=name --direction=asc --include-shadow-metadata --shadowed-by-name=dev.example.com --dry-run'],
    defaults: { dryRun: false }, badKey: 'name',
  },
];

const expected = (command, input) => {
  const output = { ...command.defaults };
  for (const [key, expressions] of command.fields) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    output[key] = expressions === strings ? (Array.isArray(value) ? [...value] : [value]) : expressions[0].startsWith('l.number(') ? Number(value) : value;
  }
  return output;
};
export const profiles = commands.flatMap(command => ['sparse', 'full'].map((density, index) => {
  const input = command[density];
  const alternate = { ...input, [command.badKey]: 'alternative' };
  const valid = [input, alternate];
  const invalid = [{ ...input, [command.badKey]: 42 }, { ...input, [command.badKey]: null }];
  return {
    id: `cli-${command.id}-${density}`, feature: command.command + ' / ' + density,
    command: command.command, density, fieldCount: command.fields.length, source: command.source,
    referencePackage: command.id.startsWith('cf-') ? 'cf@' + reference.version : undefined, badKey: command.badKey,
    accessed: '2026-10-12', argv: command.argv[index], expressions: shape(command.fields),
    valid, expectedValid: valid.map(value => expected(command, value)), invalid,
    probes: [...valid, ...invalid, { ...input, extra: 'strip' }, { ...input, [command.badKey]: undefined }, {}],
    note: 'Selected option model, validated after argv parsing. CamelCase keys, raw numeric strings, native boolean flags and scalar/repeated string arrays. CF fields come from the pinned cf package command metadata, plus mode/zone selectors. Missing configuration-dependent values remain absent. Defaults are taken from command metadata. DNS page/per-page follow the published number type without adding integer/range constraints. No command execution, config lookup, date/path/ref/zone resolution or cross-option rules.',
  };
}));
export const coverage = { commandOptions: profiles.map(profile => profile.id) };
