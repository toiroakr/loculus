import { language as typescript } from '@twinkleplop/typescript';
import { language as bash } from '@twinkleplop/bash';
import { decodeHTML } from 'entities';
import { readFile } from 'node:fs/promises';
import { dark } from '@twinkleplop/theme-github/tokens';
import { codeContents, highlightJson } from './site/assets/highlight.js';

const ts = typescript();
const shell = bash();
const lightCSS = await readFile(new URL(import.meta.resolve('@twinkleplop/theme-github/light')), 'utf8');
export const syntaxCSS = lightCSS + '\n.code-panel .twinkleplop{' + Object.entries(dark)
  .filter(([key]) => key !== 'background_color')
  .map(([key, value]) => `--twp-${key}:${value};`).join('') + '}';
export function highlightContents(source, lang = 'typescript') {
  return lang === 'json' ? highlightJson(source) : codeContents((lang === 'bash' ? shell : ts)(source));
}
export function highlightBlock(source, lang = 'typescript') {
  return `<pre class="twinkleplop"><code>${highlightContents(source, lang)}</code></pre>`;
}
export function highlightPage(html) {
  return html.replace(/(<pre\b[^>]*>)(<code\b[^>]*>)([\s\S]*?)<\/code><\/pre>/g, (_match, pre, code, content) => {
    const source = decodeHTML(content.replace(/<[^>]*>/g, ''));
    return `${pre}${code.replace('<code', '<code class="twinkleplop"')}${highlightContents(source)}</code></pre>`;
  });
}
