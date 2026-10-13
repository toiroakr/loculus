import { object, string, number, boolean, array, enum_, safeParse, fromEntries } from './validator.js';

const query = object({
  q: string({ trim: true, min: 1 }),
  page: number({ integer: true, gte: 1, default: 1 }),
  draft: boolean({ default: false }),
  tag: array(enum_(['docs', 'code']), { wrapScalar: true, optional: true }),
});
const samples = {
  valid: ['q=loculus&page=2&draft=false&tag=docs&tag=code', 'pageはnumber、draftはboolean、繰り返したtagは配列になります。'],
  defaults: ['q=loculus', 'pageは1、draftはfalseで補います。省略されたtagは出力に含みません。'],
  empty: ['q=loculus&page=', '空文字は省略ではありません。defaultで補わず、数値のエラーになります。'],
  extra: ['q=loculus&paeg=2', 'objectの既定値はstrict。pageの誤字paegは未知のキーとして拒否します。'],
  repeated: ['q=loculus&page=1&page=2', '重複キーは配列になります。numberは配列を受け取らずエラーにします。'],
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
    ? '入力を保持したまま、フィールドのパスと理由を返します。'
    : 'Loculusの通常モードで実行。出力の数値・真偽値は文字列ではありません。';
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
  note.textContent = 'q / page / draft / tagを編集できます。その他のキーはstrictで拒否します。';
  update();
});
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  const text = document.getElementById(button.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'コピー済み';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(button.dataset.copy));
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = '選択済み';
  }
  setTimeout(() => { button.textContent = 'コピー'; }, 1800);
});
update();
