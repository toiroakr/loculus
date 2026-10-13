export const libraries = ['loculus', 'zod', 'valibot'];
export const profiles = ['cli', 'form', 'url'];
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function makeSchema(api, library, profile) {
  const family = library.split('-')[0];
  let string, number, boolean, repeated, enumeration, object;
  if (family === 'loculus') {
    string = (min, max) => api.string({ min, max });
    number = (max, fallback) => api.number({ integer: true, gte: 1, lte: max, default: fallback });
    boolean = () => api.boolean({ optional: true });
    repeated = () => api.array(api.string(), { optional: true });
    enumeration = values => api.enum(values);
    object = api.object;
  } else if (family === 'zod') {
    string = (min, max) => api.string().min(min).max(max);
    number = (max, fallback) => api.union([api.string().regex(decimal).transform(Number), api.number()]).pipe(api.number().int().min(1).max(max)).default(fallback);
    boolean = () => api.union([api.boolean(), api.enum(['true','false','1','0']).transform(x => x === 'true' || x === '1')]).optional();
    repeated = () => api.union([api.array(api.string()), api.string().transform(x => [x])]).optional();
    enumeration = values => api.enum(values);
    object = api.object;
  } else {
    string = (min, max) => api.pipe(api.string(), api.minLength(min), api.maxLength(max));
    number = (max, fallback) => api.optional(api.pipe(api.union([api.pipe(api.string(), api.regex(decimal), api.transform(Number)), api.number()]), api.safeInteger(), api.minValue(1), api.maxValue(max)), fallback);
    boolean = () => api.optional(api.union([api.boolean(), api.pipe(api.picklist(['true','false','1','0']), api.transform(x => x === 'true' || x === '1'))]));
    repeated = () => api.optional(api.union([api.array(api.string()), api.pipe(api.string(), api.transform(x => [x]))]));
    enumeration = values => api.picklist(values);
    object = api.object;
  }
  if (profile === 'form') return object(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, string(1, 100)])));
  if (profile === 'cli') return object({ name: string(1, 100), port: number(65535, 3000), verbose: boolean(), mode: enumeration(['dev', 'prod']) });
  return object({ search: string(1, 100), page: number(Number.MAX_SAFE_INTEGER, 1), archived: boolean(), tag: repeated() });
}
export async function importLibrary(library) {
  if (library.startsWith('loculus')) return import('../dist/index.js');
  if (library.startsWith('zod')) return import('zod');
  return import('valibot');
}
export function inputFixture(profile, dataset) {
  if (profile === 'cli') return dataset === 'valid' ? {name:'app', port:'8080', verbose:'false', mode:'prod'} : {name:'', port:'wrong', verbose:'yes', mode:'test'};
  if (profile === 'url') return dataset === 'valid' ? 'search=hello&page=2&archived=false&tag=docs&tag=code' : 'search=&page=wrong&archived=yes&tag=docs';
  const form = new FormData();
  for (let i=0;i<30;i++) form.append(`f${i}`, dataset === 'invalid' && i === 0 ? '' : 'hello');
  return form;
}
export function normalize(profile, input) {
  if (profile === 'cli') return input;
  const entries = profile === 'url' ? new URLSearchParams(input) : input;
  const output = Object.create(null);
  for (const [key,value] of entries) {
    if (!Object.hasOwn(output,key)) output[key] = value;
    else if (Array.isArray(output[key])) output[key].push(value);
    else output[key] = [output[key],value];
  }
  return output;
}
export const expectedValues = {
  cli: {name:'app',port:8080,verbose:false,mode:'prod'},
  url: {search:'hello',page:2,archived:false,tag:['docs','code']},
  form: Object.fromEntries(Array.from({length:30},(_,i)=>[`f${i}`,'hello'])),
};
export const expectedIssueCounts = {cli:4,url:3,form:1};
