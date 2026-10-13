const declaration = "const schema=object({name:string({min:1,max:100})});";
const validation = "export const validate=input=>schema['~standard'].validate(input);";
export const sources = {
  named: `import {object,string} from 'loculus';${declaration}${validation}`,
  namespace: `import * as l from 'loculus';const schema=l.object({name:l.string({min:1,max:100})});${validation}`,
  unusedImports: `import {object,string,date,union,refine,array,number,boolean} from 'loculus';${declaration}${validation}`,
  unusedPackage: "import * as l from 'loculus';export const answer=42;",
  empty: 'export const answer=42;',
  unusedSchema: `import {object,string,date} from 'loculus';const unused=date();${declaration}${validation}`,
  unusedObject: `import {object,string,date} from 'loculus';const unused=object({created:date()});${declaration}${validation}`,
  pureUnusedSchema: `import {object,string,date} from 'loculus';const unused=/* @__PURE__ */date();${declaration}${validation}`,
  pureUnusedObject: `import {object,string,date} from 'loculus';const unused=/* @__PURE__ */object({created:/* @__PURE__ */date()});${declaration}${validation}`,
  pureWithArgumentEffect: `import {object,string,date} from 'loculus';export let effects=0;function options(){effects++;return {}}const unused=/* @__PURE__ */date(options());${declaration}${validation}`,
};
