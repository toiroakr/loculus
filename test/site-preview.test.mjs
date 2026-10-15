import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8').split('\n');
const start = lines.indexOf('          script: |');
assert.ok(start >= 0, 'Preview comment script must exist');
const script = [];
for (const line of lines.slice(start + 1)) {
  if (line.trim() && !line.startsWith('            ')) break;
  script.push(line.slice(12));
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('github', 'context', script.join('\n'));
const context = { repo: { owner: 'owner', repo: 'repo' }, payload: { pull_request: { number: 26, head: { sha: 'current-sha' } } } };
process.env.SITE_URL = 'https://example.com/site';
process.env.FORM_URL = 'https://example.com/form';
process.env.COMPATIBILITY_URL = 'https://example.com/compatibility';
function client({ comments = [], state = 'open', sha = 'current-sha' } = {}) {
  const writes = [];
  let reads = 0;
  const github = {
    rest: {
      pulls: { get: async args => {
        assert.equal(args.pull_number, 26);
        return { data: { state, head: { sha } } };
      } },
      issues: {
        listComments: Symbol('listComments'),
        createComment: async args => writes.push({ method: 'create', ...args }),
        updateComment: async args => writes.push({ method: 'update', ...args }),
      },
    },
    paginate: async (method, args) => {
      assert.equal(method, github.rest.issues.listComments);
      assert.equal(args.issue_number, 26);
      reads++;
      return comments;
    },
  };
  return { github, writes, reads: () => reads };
}
test('site preview creates one comment containing all preview links and the source commit', async () => {
  const api = client();
  await run(api.github, context);
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].method, 'create');
  assert.equal(api.writes[0].issue_number, 26);
  for (const text of ['<!-- loculus-site-preview -->', 'current-sha', process.env.SITE_URL, process.env.FORM_URL, process.env.COMPATIBILITY_URL]) {
    assert.ok(api.writes[0].body.includes(text));
  }
});
test('site preview updates its bot comment without replacing human comments', async () => {
  const api = client({ comments: [
    { id: 1, user: { login: 'person' }, body: '<!-- loculus-site-preview -->' },
    { id: 2, user: null, body: null },
    { id: 3, user: { login: 'github-actions[bot]' }, body: '<!-- loculus-site-preview --> old preview' },
  ] });
  await run(api.github, context);
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].method, 'update');
  assert.equal(api.writes[0].comment_id, 3);
});
test('site preview ignores closed PRs and builds for an outdated commit', async () => {
  for (const config of [{ state: 'closed' }, { sha: 'newer-sha' }]) {
    const api = client(config);
    await run(api.github, context);
    assert.deepEqual(api.writes, []);
    assert.equal(api.reads(), 0);
  }
});
