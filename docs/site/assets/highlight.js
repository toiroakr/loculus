import { language } from '@twinkleplop/json';

const json = language();
export const codeContents = html => html.slice(html.indexOf('<code>') + 6, html.lastIndexOf('</code>'));
export const highlightJson = source => codeContents(json(source));
