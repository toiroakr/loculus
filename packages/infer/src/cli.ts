import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { findOutdated, generate, type GenerateOptions } from './generate.js';

const help = `Usage: loculus-infer [options] <files...>

Extract Input/Output types from exported Loculus schemas.

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
`;

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      project: { type: 'string', short: 'p' },
      exclude: { type: 'string', multiple: true },
      schemas: { type: 'string' },
      'input-only': { type: 'boolean' },
      'output-only': { type: 'boolean' },
      'merge-same': { type: 'boolean' },
      suffix: { type: 'string' },
      'input-suffix': { type: 'string' },
      'output-suffix': { type: 'string' },
      map: { type: 'string' },
      'with-descriptions': { type: 'boolean' },
      outDir: { type: 'string' },
      outFile: { type: 'string' },
      outPattern: { type: 'string' },
      declaration: { type: 'boolean', short: 'd' },
      'dry-run': { type: 'boolean' },
      check: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write(help);
    return 2;
  }
  const options: GenerateOptions = {
    include: positionals,
    ...(values.exclude && { exclude: values.exclude }),
    ...(values.project && { project: values.project }),
    ...(values.schemas && { schemas: list(values.schemas) }),
    ...(values.map && { map: parseMap(values.map) }),
    ...(values.suffix && { suffix: values.suffix }),
    // An empty suffix is meaningful: `--output-only --output-suffix ''` names types after the schema.
    ...(values['input-suffix'] !== undefined && { inputSuffix: values['input-suffix'] }),
    ...(values['output-suffix'] !== undefined && { outputSuffix: values['output-suffix'] }),
    ...(values.outDir && { outDir: values.outDir }),
    ...(values.outFile && { outFile: values.outFile }),
    ...(values.outPattern && { outPattern: values.outPattern }),
    inputOnly: values['input-only'] ?? false,
    outputOnly: values['output-only'] ?? false,
    mergeSame: values['merge-same'] ?? false,
    withDescriptions: values['with-descriptions'] ?? false,
    declaration: values.declaration ?? false,
  };
  if (values.check && !values.outDir && !values.outFile) throw new Error('--check needs --outDir or --outFile');
  const { files, warnings } = await generate(options);
  for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
  if (values.check) {
    const outdated = await findOutdated(files);
    for (const file of outdated) process.stderr.write(`out of date: ${relative(process.cwd(), file.path!)}\n`);
    return outdated.length ? 1 : 0;
  }
  const print = values['dry-run'] || files.every((file) => !file.path);
  for (const [index, file] of files.entries()) {
    if (file.obsolete) {
      if (print) process.stdout.write(`${index ? '\n' : ''}// delete ${relative(process.cwd(), file.path!)}\n`);
      else {
        await rm(file.path!);
        process.stderr.write(`deleted ${relative(process.cwd(), file.path!)}\n`);
      }
    } else if (print) {
      const label = file.path ?? file.sources[0]!;
      if (files.length > 1 || file.path)
        process.stdout.write(`${index ? '\n' : ''}// ${relative(process.cwd(), label)}\n`);
      process.stdout.write(file.content);
    } else {
      await mkdir(dirname(file.path!), { recursive: true });
      await writeFile(file.path!, file.content);
      process.stderr.write(`wrote ${relative(process.cwd(), file.path!)}\n`);
    }
  }
  if (files.length === 0) process.stderr.write('No exported Loculus schemas found.\n');
  return 0;
}

function list(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMap(value: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of list(value)) {
    const [from, to, extra] = entry.split(':').map((part) => part.trim());
    if (!from || !to || extra !== undefined) throw new Error(`Invalid mapping "${entry}"; expected Schema:Type`);
    map[from] = to;
  }
  return map;
}
