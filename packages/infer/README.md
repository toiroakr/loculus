# @loculus/infer

Extract the `Input` and `Output` types of [Loculus](https://github.com/toiroakr/loculus) schemas as plain TypeScript source, like [zinfer](https://github.com/toiroakr/zinfer) does for Zod.

Use it to publish readable types for an API, to check generated types into a repository that does not depend on Loculus, or to see what a schema accepts and returns.

```bash
npm install --save-dev @loculus/infer
```

## CLI

```ts
// src/query.ts
import * as l from 'loculus';

export const QuerySchema = l.object(
  {
    search: l.string({ trim: true, min: 1, description: 'Words to search for' }),
    page: l.number({ integer: true, gte: 1, default: 1 }),
    tag: l.array(l.enum(['docs', 'code']), { wrapScalar: true, optional: true }),
  },
  { description: 'Search query parameters' },
);
```

```bash
npx loculus-infer src/query.ts --suffix Schema --with-descriptions
```

```ts
/** Search query parameters */
export type QueryInput = {
  /** Words to search for */
  search: string;
  page?: string | number | undefined;
  tag?: 'docs' | 'code' | readonly ('docs' | 'code')[] | undefined;
};

/** Search query parameters */
export type QueryOutput = {
  /** Words to search for */
  search: string;
  page: number;
  tag?: ('docs' | 'code')[] | undefined;
};
```

Every exported Loculus schema in the matching files is extracted. Fields keep the order of the `object()` shape.

```
Usage: loculus-infer [options] <files...>

Options:
  -p, --project <path>      Path to tsconfig.json
  --exclude <glob>          Skip matching files (repeatable)
  --schemas <names>         Comma-separated schema names to extract
  --input-only              Emit only input types
  --output-only             Emit only output types
  --merge-same              Emit one type when input and output are identical
  --suffix <suffix>         Remove this suffix from schema names (e.g. Schema)
  --input-suffix <suffix>   Suffix for input type names (default: Input)
  --output-suffix <suffix>  Suffix for output type names (default: Output)
  --map <mappings>          Comma-separated renames (e.g. UserSchema:User)
  --with-descriptions       Emit description options as TSDoc comments
  --outDir <dir>            Write one module per source file into this directory
  --outFile <file>          Write all types into one module
  --outPattern <pattern>    File name inside outDir (default: [name].types.ts)
  -d, --declaration         Use .d.ts file names in outDir
  --dry-run                 Print the files instead of writing them
  --check                   Exit with 1 when written files are out of date
  -h, --help                Show this help
```

Without `--outDir` or `--outFile`, types are printed to standard output. Use `--check` in CI to fail when generated files are out of date.

## Library

```ts
import { LoculusTypeExtractor, generate, renderModule } from '@loculus/infer';

const extractor = new LoculusTypeExtractor({ project: './tsconfig.json' });
const { input, output } = extractor.extract('src/query.ts', 'QuerySchema');

const schemas = extractor.extractAll('src/query.ts', { withDescriptions: true });
const source = renderModule(schemas, { suffix: 'Schema', mergeSame: true });

const { files } = await generate({ include: ['src/**/*.ts'], outDir: 'types' });
```

## How types are printed

- Types come from the TypeScript compiler, so they match `l.Input<typeof schema>` and `l.Output<typeof schema>`. The tests check this with type-level equality.
- Object types, intersections and Loculus helper types such as `ObjectInput` are written out in full.
- Named interfaces and classes stay as references, such as `Date`, `URL` or an interface returned by `transform()`. The generated module imports exported types from their own modules. A type that is not exported produces a warning.
- `--with-descriptions` reads `description` options written as string literals, including fields of nested `object()` shapes and array rows. Descriptions computed at runtime are not read. After `unflatten()`, only the input type gets field comments, because the output keys are restructured.

The extractor uses the tsconfig.json given by `--project`, or the nearest one above the working directory. Without one, it uses strict NodeNext settings.

## License

MIT
