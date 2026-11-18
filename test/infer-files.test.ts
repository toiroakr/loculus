import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { resolveFiles } from '../packages/infer/src/generate.js';

test('selects TypeScript files with exclusions, extglobs, dotfiles and symlinks', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loculus-infer-files-'));
  try {
    const files = [
      'src/a.ts',
      'src/a.test.ts',
      'src/b.tsx',
      'src/c.mts',
      'src/d.cts',
      'src/e.d.ts',
      'src/e.d.mts',
      'src/z.js',
      'src/nested/z.ts',
      'src/.hidden.ts',
      'src/.test.ts',
      '.hidden/root.ts',
      'node_modules/pkg/hidden.ts',
      'real/linked.ts',
    ];
    for (const name of files) {
      await mkdir(join(cwd, name, '..'), { recursive: true });
      await writeFile(join(cwd, name), '');
    }
    await mkdir(join(cwd, 'src/folder.ts'));
    await symlink(join(cwd, 'real'), join(cwd, 'src/link'), 'junction');
    await symlink(join(cwd, 'real/linked.ts'), join(cwd, 'src/file-link.ts'), 'file');
    const selected = async (include: string[], exclude: string[] = []) =>
      (await resolveFiles(include, exclude, cwd)).map((file) => relative(cwd, file).replaceAll('\\', '/'));
    const ordinary = ['src/a.test.ts', 'src/a.ts', 'src/file-link.ts', 'src/link/linked.ts', 'src/nested/z.ts'];
    assert.deepEqual(await selected(['src/**/*.ts']), ordinary);
    assert.deepEqual(await selected(['src/**/*.ts', 'src/a.ts']), ordinary);
    assert.deepEqual(await selected([join(cwd, 'src/**/*.ts')]), ordinary);
    assert.deepEqual(await selected(['src/**/*.{ts,tsx,mts,cts}']), [
      'src/a.test.ts',
      'src/a.ts',
      'src/b.tsx',
      'src/c.mts',
      'src/d.cts',
      'src/file-link.ts',
      'src/link/linked.ts',
      'src/nested/z.ts',
    ]);
    assert.deepEqual(await selected(['src/**/*.ts', '!src/**/*.test.ts']), [
      'src/a.ts',
      'src/file-link.ts',
      'src/link/linked.ts',
      'src/nested/z.ts',
    ]);
    assert.deepEqual(await selected(['src/**/*.ts'], ['**/*.test.ts', '**/nested/**']), [
      'src/a.ts',
      'src/file-link.ts',
      'src/link/linked.ts',
    ]);
    assert.deepEqual(await selected(['src/**/!(*.test).ts']), [
      'src/.hidden.ts',
      'src/a.ts',
      'src/file-link.ts',
      'src/link/linked.ts',
      'src/nested/z.ts',
    ]);
    assert.deepEqual(await selected(['src/.hidden.ts', '.hidden/*.ts']), ['.hidden/root.ts', 'src/.hidden.ts']);
    assert.deepEqual(await selected(['src/link/**/*.ts']), ['src/link/linked.ts']);
    assert.deepEqual(await selected(['src/file-link.ts']), ['src/file-link.ts']);
    assert.deepEqual(await selected(['src']), []);
    assert.deepEqual(await selected(['src/folder.ts']), []);
    assert.deepEqual(await selected(['missing/**/*.ts']), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
