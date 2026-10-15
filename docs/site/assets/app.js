import { object, string, number, boolean, array, enum_, safeParse, fromEntries } from './validator.js';

const query = object({
  q: string({ trim: true, min: 1 }),
  page: number({ integer: true, gte: 1, default: 1 }),
  draft: boolean({ default: false }),
  tag: array(enum_(['docs', 'code']), { wrapScalar: true, optional: true }),
});
const samples = {
  valid: ['q=loculus&page=2&draft=false&tag=docs&tag=code', 'page becomes a number, draft becomes a boolean, and repeated tag values become an array.'],
  defaults: ['q=loculus', 'Missing page defaults to 1 and draft to false. An omitted tag is left out of the output.'],
  empty: ['q=loculus&page=', 'An empty string is not missing. It produces a number error instead of using a default.'],
  extra: ['q=loculus&paeg=2', 'Objects are strict by default. The misspelled paeg key is rejected.'],
  repeated: ['q=loculus&page=1&page=2', 'Repeated keys become arrays. number() rejects arrays.'],
};
const input = document.querySelector('#query-input');
const status = document.querySelector('#result-status');
const output = document.querySelector('#result-output');
const note = document.querySelector('#sample-note');
const buttons = [...document.querySelectorAll('[data-sample]')];
function update() {
  const value = fromEntries(new URLSearchParams(input.value.replace(/^\?/, '')));
  document.querySelector('#raw-output').textContent = JSON.stringify(value, null, 2);
  const result = safeParse(query, value);
  const failed = !!result.issues;
  status.textContent = failed ? 'ERROR' : 'VALID';
  status.classList.toggle('error', failed);
  output.textContent = JSON.stringify(failed ? { issues: result.issues } : result.value, null, 2);
  document.querySelector('#output-note').textContent = failed
    ? 'Returns the field path and reason, preserving input.'
    : 'Uses the ordinary Loculus runtime. Output numbers and booleans are no longer strings.';
}
for (const button of buttons) button.addEventListener('click', () => {
  const [text, description] = samples[button.dataset.sample];
  input.value = text;
  note.textContent = description;
  for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  update();
});
input.addEventListener('input', () => {
  for (const item of buttons) item.setAttribute('aria-pressed', 'false');
  note.textContent = 'Edit q / page / draft / tag. Strict mode rejects other keys.';
  update();
});
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  const text = document.getElementById(button.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(button.dataset.copy));
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Selected';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 1800);
});
update();
