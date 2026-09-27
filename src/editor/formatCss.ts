import type { ScriptFormat } from '../core/formats';
import { editorSpaceBefore } from './plugins/layout';

/**
 * CSS for a script format, generated from the same numbers the paginator
 * uses. Everything is in `ch` (one Courier character = 0.1") and `em`
 * (one line), so the editor's line wrapping matches the printed page.
 */
export function formatCss(format: ScriptFormat): string {
  const { page } = format;
  const left = page.marginLeftIn * 10;
  const right = page.marginRightIn * 10;
  const rules: string[] = [
    // Content-box: the text column plus margins adds up to the full page width.
    `.pl-page { width: ${page.widthIn * 10 - left - right}ch; padding: ${page.marginTopIn * 6}em ${right}ch ${page.marginTopIn * 6}em ${left}ch; }`,
    `.pl-page .pl-el-label { left: -${left - 1}ch; width: ${left - 3}ch; }`,
    `.pl-page .pl-page-break { left: -${left}ch; width: ${page.widthIn * 10}ch; }`,
  ];
  for (const kind of format.elementOrder) {
    const s = format.elements[kind];
    const sel = `.pl-el[data-kind="${kind}"]`;
    const decl = [
      `margin-left: ${s.indent}ch`,
      `width: ${s.width}ch`,
      `margin-top: ${editorSpaceBefore(format, kind)}em`,
      `text-align: ${s.align}`,
    ];
    if (s.caps) decl.push('text-transform: uppercase');
    if (s.bold) decl.push('font-weight: 700');
    if (s.underline) decl.push('text-decoration: underline');
    if (s.hangingIndent) decl.push(`padding-left: ${s.hangingIndent}ch`, `text-indent: -${s.hangingIndent}ch`, `width: ${s.width - s.hangingIndent}ch`);
    rules.push(`${sel} { ${decl.join('; ')}; }`);
    // Labels in the margin sit at the page's left edge whatever the indent.
    rules.push(`${sel} .pl-el-label { left: -${left - 1 + s.indent}ch; }`);
    rules.push(`${sel} .pl-page-break { left: -${left + s.indent}ch; }`);
    // Revision marks sit in the right margin, 0.6" past the text column.
    rules.push(`${sel} .pl-rev-mark { left: ${page.widthIn * 10 - left - right + 6 - s.indent}ch; }`);
    if (s.wrapWith) {
      const [open, close] = s.wrapWith.map((t) => JSON.stringify(t));
      rules.push(`${sel}::before { content: ${open}; }`);
      rules.push(`${sel}::after { content: ${close}; }`);
      rules.push(`${sel}.is-empty::after { content: attr(data-placeholder) ${close}; color: var(--placeholder); }`);
    } else {
      const align = s.align === 'center' ? 'left: 0; right: 0;' : s.align === 'right' ? 'right: 0;' : 'left: 0;';
      rules.push(`${sel}.is-empty::before { content: attr(data-placeholder); position: absolute; ${align} color: var(--placeholder); pointer-events: none; }`);
    }
  }
  return rules.join('\n');
}
