import type { ScriptFormat } from '../formats';
import { upperSafe } from '../layout/paginate';
import { emptyTitlePage, normalizeRuns, plainText, type ElementKind, type ScriptElement, type TextRun, type TitlePage } from '../types';
import type { ParsedScript } from './fountain';

/**
 * Final Draft (.fdx) — the XML format used by Final Draft and read by most
 * professional tools. "New Act" / "End of Act" are Final Draft's own TV
 * element names. Notes are not written (Final Draft attaches notes to text
 * ranges rather than storing them as paragraphs).
 */

const KIND_TO_FDX: Record<ElementKind, string | null> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  act_start: 'New Act',
  act_end: 'End of Act',
  note: null,
};

const FDX_TO_KIND: Record<string, ElementKind> = {
  'scene heading': 'scene_heading',
  action: 'action',
  general: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'shot',
  'new act': 'act_start',
  'end of act': 'act_end',
  'act break': 'act_start',
  'cold opening': 'act_start',
  teaser: 'act_start',
};

function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textNodes(runs: TextRun[]): string {
  return runs
    .map((run) => {
      const styles = [run.bold && 'Bold', run.italic && 'Italic', run.underline && 'Underline'].filter(Boolean);
      const attr = styles.length ? ` Style="${styles.join('+')}"` : '';
      return `<Text${attr}>${xml(run.text)}</Text>`;
    })
    .join('');
}

function paragraph(type: string, runs: TextRun[], extra = ''): string {
  return `    <Paragraph Type="${type}"${extra}>${textNodes(runs.length ? runs : [{ text: '' }])}</Paragraph>`;
}

function titlePageXml(tp: TitlePage): string {
  const lines: string[] = [];
  const center = (text: string) =>
    lines.push(`      <Paragraph Alignment="Center" Type="Title Page"><Text>${xml(text)}</Text></Paragraph>`);
  const left = (text: string) =>
    lines.push(`      <Paragraph Alignment="Left" Type="Title Page"><Text>${xml(text)}</Text></Paragraph>`);
  for (let i = 0; i < 16; i++) center('');
  if (tp.title) center(tp.title.toUpperCase());
  if (tp.episode) {
    center('');
    center(`"${tp.episode}"`);
  }
  if (tp.authors) {
    center('');
    center(tp.credit || 'Written by');
    center('');
    for (const a of tp.authors.split('\n')) center(a);
  }
  if (tp.source) {
    center('');
    center(tp.source);
  }
  for (let i = 0; i < 12; i++) left('');
  for (const c of [...tp.draft.split('\n'), ...tp.contact.split('\n')].filter(Boolean)) left(c);
  return `  <TitlePage>\n    <Content>\n${lines.join('\n')}\n    </Content>\n  </TitlePage>`;
}

export function serializeFdx(script: { titlePage: TitlePage; elements: ScriptElement[] }, format: ScriptFormat): string {
  const paragraphs: string[] = [];
  for (const el of script.elements) {
    const type = KIND_TO_FDX[el.kind];
    if (!type) continue;
    const style = format.elements[el.kind];
    let runs: TextRun[] = normalizeRuns(el.runs).map((r) => ({
      ...r,
      text: style.caps ? upperSafe(r.text) : r.text,
      bold: r.bold || style.bold || undefined,
      underline: r.underline || style.underline || undefined,
    }));
    if (el.kind === 'parenthetical') {
      const t = plainText({ runs }).trim();
      if (!(t.startsWith('(') && t.endsWith(')'))) runs = normalizeRuns([{ text: '(' }, ...runs, { text: ')' }]);
    }
    const extra = style.startsPage ? ' StartsNewPage="Yes"' : '';
    paragraphs.push(paragraph(type, runs, extra));
  }
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>',
    ...paragraphs,
    '  </Content>',
    titlePageXml(script.titlePage),
    '</FinalDraft>',
    '',
  ].join('\n');
}

function runsOf(p: Element): TextRun[] {
  const runs: TextRun[] = [];
  for (const t of Array.from(p.getElementsByTagName('Text'))) {
    const style = (t.getAttribute('Style') ?? '').toLowerCase();
    const run: TextRun = { text: t.textContent ?? '' };
    if (style.includes('bold')) run.bold = true;
    if (style.includes('italic')) run.italic = true;
    if (style.includes('underline')) run.underline = true;
    runs.push(run);
  }
  return normalizeRuns(runs);
}

function childrenNamed(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((c) => c.tagName === name);
}

function parseTitlePageXml(root: Element): TitlePage {
  const tp = emptyTitlePage();
  const page = childrenNamed(root, 'TitlePage')[0];
  const content = page && childrenNamed(page, 'Content')[0];
  if (!content) return tp;
  const centered: string[] = [];
  const left: string[] = [];
  for (const p of childrenNamed(content, 'Paragraph')) {
    const text = plainText({ runs: runsOf(p) }).trim();
    if (!text) continue;
    ((p.getAttribute('Alignment') ?? 'Left') === 'Center' ? centered : left).push(text);
  }
  const creditAt = centered.findIndex((t) => /^(written|teleplay|story|screenplay)\b|\bby$/i.test(t));
  const top = creditAt >= 0 ? centered.slice(0, creditAt) : centered.slice(0, 2);
  tp.title = top[0] ?? '';
  tp.episode = (top[1] ?? '').replace(/^["“]|["”]$/g, '');
  if (creditAt >= 0) {
    tp.credit = centered[creditAt];
    tp.authors = centered.slice(creditAt + 1).join('\n');
  }
  const draftAt = left.findIndex((t) => /draft|revision|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(t));
  if (draftAt >= 0) tp.draft = left.splice(draftAt, 1)[0];
  tp.contact = left.join('\n');
  return tp;
}

export function parseFdx(source: string): ParsedScript {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'FinalDraft' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('This does not look like a Final Draft (.fdx) file.');
  }
  const content = childrenNamed(root, 'Content')[0];
  const elements: ScriptElement[] = [];
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.tagName === 'DualDialogue') {
        visit(child);
        continue;
      }
      if (child.tagName !== 'Paragraph') continue;
      const type = (child.getAttribute('Type') ?? 'Action').toLowerCase();
      const kind = FDX_TO_KIND[type] ?? 'action';
      let runs = runsOf(child);
      if (kind === 'parenthetical') {
        const text = plainText({ runs });
        const open = text.indexOf('(');
        const close = text.lastIndexOf(')');
        if (open >= 0 && close > open && !text.slice(0, open).trim() && !text.slice(close + 1).trim()) {
          runs = normalizeRuns(
            runs.map((r) => ({ ...r })).map((r, i, all) => {
              if (i === 0) r.text = r.text.replace(/^\s*\(/, '');
              if (i === all.length - 1) r.text = r.text.replace(/\)\s*$/, '');
              return r;
            }),
          );
        }
      }
      if (kind === 'act_start' || kind === 'act_end') runs = [{ text: plainText({ runs }).trim() }];
      elements.push({ kind, runs });
    }
  };
  if (content) visit(content);
  return { titlePage: parseTitlePageXml(root), elements };
}
