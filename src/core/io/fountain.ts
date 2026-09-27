import { looksLikeSceneHeading } from '../analysis';
import type { ScriptFormat } from '../formats';
import { upperSafe } from '../layout/paginate';
import {
  emptyTitlePage,
  plainText,
  textElement,
  type ElementKind,
  type ScriptElement,
  type TextRun,
  type TitlePage,
} from '../types';
import { parseEmphasis, serializeEmphasis } from './inline';

/**
 * Fountain (https://fountain.io) — the open, plain-text screenplay format
 * that Highland, WriterDuet, Final Draft, Fade In, Slugline and others read.
 *
 * TV conventions used here:
 *   • acts are centered, bold, underlined lines:  > **_ACT ONE_** <
 *     preceded by a page break (===);
 *   • notes are [[double-bracketed]];
 *   • shots are all-caps action lines (ANGLE ON…, BACK TO SCENE).
 */

export interface ParsedScript {
  titlePage: TitlePage;
  elements: ScriptElement[];
}

const ACT_START = /^(COLD OPEN|TEASER|PROLOGUE|EPILOGUE|TAG|ACT\s+[A-Z0-9]+)$/i;
const ACT_END = /^END OF\b/i;
const SHOT = /^(ANGLE ON|CLOSE ON|CLOSE-UP|WIDE ON|WIDE SHOT|BACK TO SCENE|INSERT|POV|RESUME|MONTAGE|END MONTAGE|SERIES OF SHOTS|FLASHBACK|END FLASHBACK|TALKING HEAD|SPLIT SCREEN|ON\s)/;

function isUpper(text: string): boolean {
  return /\p{L}/u.test(text) && text === upperSafe(text);
}

function isCharacterCue(line: string): boolean {
  const name = line.replace(/\^\s*$/, '').trim();
  const beforeParen = name.split('(')[0];
  return /\p{L}/u.test(beforeParen) && beforeParen === upperSafe(beforeParen) && !/[.:!?]$/.test(beforeParen.trim());
}

function stripSceneNumber(text: string): string {
  return text.replace(/\s*#[\w.-]+#\s*$/, '').trim();
}

const NOTE_MARK = '\u0000';

/** Pull [[notes]] out of a block. Lines that held only a note are dropped. */
function extractNotes(lines: string[]): { lines: string[]; notes: string[] } {
  const notes: string[] = [];
  const joined = lines.join('\n').replace(/\[\[([\s\S]*?)\]\]/g, (_, note: string) => {
    notes.push(note.replace(/\s+/g, ' ').trim());
    return NOTE_MARK;
  });
  if (!notes.length) return { lines, notes };
  const kept = joined
    .split('\n')
    .filter((l) => !(l.includes(NOTE_MARK) && !l.replaceAll(NOTE_MARK, '').trim()))
    .map((l) => l.replaceAll(NOTE_MARK, '').replace(/[ \t]{2,}/g, ' ').trimEnd());
  return { lines: kept, notes: notes.filter(Boolean) };
}

function el(kind: ElementKind, text: string, emphasis = true): ScriptElement {
  return emphasis ? { kind, runs: parseEmphasis(text) } : textElement(kind, text);
}

function parseTitlePage(lines: string[]): TitlePage {
  const tp = emptyTitlePage();
  const values: Record<string, string[]> = {};
  let key = '';
  for (const raw of lines) {
    const m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(raw);
    if (m && !/^\s/.test(raw)) {
      key = m[1].trim().toLowerCase();
      values[key] = m[2].trim() ? [m[2].trim()] : [];
    } else if (key) {
      values[key].push(raw.trim());
    }
  }
  const get = (...keys: string[]) => {
    for (const k of keys) if (values[k]) return values[k].join('\n');
    return '';
  };
  tp.title = get('title').replace(/_|\*/g, '');
  tp.episode = get('episode').replace(/^["“]|["”]$/g, '');
  // A two-line title ("SHOW\n"Episode"") is the common TV convention.
  if (!tp.episode && tp.title.includes('\n')) {
    const [first, ...rest] = tp.title.split('\n');
    tp.title = first;
    tp.episode = rest.join(' ').replace(/^["“]|["”]$/g, '');
  }
  tp.credit = get('credit') || tp.credit;
  tp.authors = get('author', 'authors');
  tp.source = get('source');
  tp.draft = get('draft date', 'draft', 'date');
  tp.contact = get('contact');
  return tp;
}

export function parseFountain(source: string, options: { titlePage?: boolean } = {}): ParsedScript {
  let text = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, ''); // boneyard
  let lines = text.split('\n');

  let titlePage = emptyTitlePage();
  const firstContent = lines.findIndex((l) => l.trim());
  const hasTitlePage =
    options.titlePage !== false &&
    firstContent >= 0 &&
    /^[A-Za-z][A-Za-z ]*:/.test(lines[firstContent]) &&
    !looksLikeSceneHeading(lines[firstContent]);
  if (hasTitlePage) {
    let end = firstContent;
    while (end < lines.length && lines[end].trim()) end++;
    titlePage = parseTitlePage(lines.slice(firstContent, end));
    lines = lines.slice(end);
  }

  // Group into blocks separated by blank lines. A line of exactly two spaces
  // keeps a block going (Fountain's way of writing an empty line in dialogue).
  const blocks: string[][] = [];
  let block: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' && line !== '  ') {
      if (block.length) blocks.push(block);
      block = [];
    } else {
      block.push(line);
    }
  }
  if (block.length) blocks.push(block);

  const elements: ScriptElement[] = [];
  const push = (e: ScriptElement, notes: string[] = []) => {
    elements.push(e);
    for (const n of notes) elements.push(textElement('note', n));
  };

  for (const rawBlock of blocks) {
    const first = rawBlock[0].trim();

    if (/^={3,}$/.test(first)) continue; // page break
    if (/^\[\[[\s\S]*\]\]$/.test(rawBlock.join('\n').trim())) {
      push(textElement('note', rawBlock.join('\n').trim().slice(2, -2).trim()));
      continue;
    }
    if (/^#/.test(first)) {
      const title = first.replace(/^#+\s*/, '').trim();
      if (ACT_START.test(title)) push(textElement('act_start', title.toUpperCase()));
      else if (ACT_END.test(title)) push(textElement('act_end', title.toUpperCase()));
      continue; // other sections are outline-only
    }
    if (/^=(?!=)/.test(first)) {
      push(textElement('note', rawBlock.map((l) => l.replace(/^=\s*/, '')).join(' ').trim()));
      continue;
    }

    const { lines: blockLines, notes } = extractNotes(rawBlock);
    if (!blockLines.length) {
      for (const n of notes) push(textElement('note', n));
      continue;
    }
    const head = blockLines[0].trim();

    if (/^\.[^.]/.test(head) && blockLines.length === 1) {
      push(el('scene_heading', stripSceneNumber(head.slice(1)), false), notes);
      continue;
    }
    if (looksLikeSceneHeading(head) && blockLines.length === 1) {
      push(el('scene_heading', stripSceneNumber(head), false), notes);
      continue;
    }
    if (/^>.*<$/.test(head) && blockLines.length === 1) {
      const inner = head.slice(1, -1).trim();
      const plain = inner.replace(/[*_]/g, '').trim();
      if (ACT_START.test(plain)) push(textElement('act_start', plain.toUpperCase()), notes);
      else if (ACT_END.test(plain)) push(textElement('act_end', plain.toUpperCase()), notes);
      else push(el('action', inner), notes);
      continue;
    }
    if (/^>/.test(head) && blockLines.length === 1) {
      push(el('transition', head.slice(1).trim(), false), notes);
      continue;
    }
    if (blockLines.length === 1 && isUpper(head) && /TO:$/.test(head)) {
      push(el('transition', head, false), notes);
      continue;
    }
    if (blockLines.length === 1 && /^(FADE OUT\.|FADE IN:|FADE TO BLACK\.|CUT TO BLACK\.)$/.test(head)) {
      push(el('transition', head, false), notes);
      continue;
    }

    const forcedCharacter = head.startsWith('@');
    if (!head.startsWith('!') && blockLines.length >= 2 && (forcedCharacter || isCharacterCue(head))) {
      const cue = head.replace(/^@/, '').replace(/\s*\^\s*$/, '').trim();
      push(el('character', cue, false));
      let dialogue: string[] = [];
      const flushDialogue = () => {
        if (dialogue.length) push(el('dialogue', dialogue.join('\n')));
        dialogue = [];
      };
      for (const line of blockLines.slice(1)) {
        const t = line.trim();
        if (/^\(.*\)$/.test(t)) {
          flushDialogue();
          push(el('parenthetical', t.slice(1, -1).trim()));
        } else {
          dialogue.push(line === '  ' ? '' : t);
        }
      }
      flushDialogue();
      for (const n of notes) push(textElement('note', n));
      continue;
    }

    if (blockLines.length === 1 && isUpper(head) && SHOT.test(head)) {
      push(el('shot', head, false), notes);
      continue;
    }
    const actionText = blockLines
      .map((l, i) => (i === 0 ? l.replace(/^\s*!/, '') : l).trimEnd())
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
    if (actionText.trim()) push(el('action', actionText), notes);
    else for (const n of notes) push(textElement('note', n));
  }

  return { titlePage, elements };
}

function titlePageFountain(tp: TitlePage): string {
  const lines: string[] = [];
  const field = (key: string, value: string) => {
    if (!value.trim()) return;
    const parts = value.split('\n').map((v) => v.trim()).filter(Boolean);
    if (parts.length === 1) lines.push(`${key}: ${parts[0]}`);
    else lines.push(`${key}:`, ...parts.map((p) => `    ${p}`));
  };
  field('Title', tp.title);
  if (tp.episode.trim()) field('Episode', `"${tp.episode.trim()}"`);
  field('Credit', tp.authors.trim() ? tp.credit : '');
  field('Author', tp.authors);
  field('Source', tp.source);
  field('Draft date', tp.draft);
  field('Contact', tp.contact);
  return lines.join('\n');
}

function needsForcedAction(text: string): boolean {
  const firstLine = text.split('\n')[0].trim();
  if (!firstLine) return false;
  if (/^[.@>~=#!]|^\[\[/.test(firstLine)) return true;
  if (looksLikeSceneHeading(firstLine)) return true;
  if (isUpper(firstLine) && (/TO:$/.test(firstLine) || text.includes('\n'))) return true;
  return false;
}

function runsText(runs: TextRun[], caps: boolean): string {
  return serializeEmphasis(caps ? runs.map((r) => ({ ...r, text: upperSafe(r.text) })) : runs);
}

export function serializeFountain(script: { titlePage: TitlePage; elements: ScriptElement[] }, format: ScriptFormat): string {
  const out: string[] = [];
  const tp = titlePageFountain(script.titlePage);
  if (tp) out.push(tp, '');

  let inSpeech = false;
  let sawAct = false;
  const blank = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  for (const element of script.elements) {
    const text = plainText(element);
    if (!text.trim()) continue;
    const caps = format.elements[element.kind].caps;
    switch (element.kind) {
      case 'scene_heading': {
        blank();
        const heading = upperSafe(text.trim());
        out.push(looksLikeSceneHeading(heading) ? heading : `.${heading}`);
        inSpeech = false;
        break;
      }
      case 'action': {
        blank();
        const body = runsText(element.runs, false);
        out.push(needsForcedAction(text) ? `!${body}` : body);
        inSpeech = false;
        break;
      }
      case 'shot':
        blank();
        out.push(upperSafe(text.trim()));
        inSpeech = false;
        break;
      case 'character': {
        blank();
        const cue = upperSafe(text.trim());
        out.push(isCharacterCue(cue) ? cue : `@${cue}`);
        inSpeech = true;
        break;
      }
      case 'parenthetical':
        if (!inSpeech) blank();
        out.push(`(${runsText(element.runs, false).trim().replace(/^\(|\)$/g, '')})`);
        break;
      case 'dialogue': {
        if (!inSpeech) blank();
        const body = runsText(element.runs, caps);
        out.push(...body.split('\n').map((l) => (l === '' ? '  ' : l)));
        break;
      }
      case 'transition': {
        blank();
        const t = upperSafe(text.trim());
        out.push(/TO:$/.test(t) ? t : `> ${t}`);
        inSpeech = false;
        break;
      }
      case 'act_start':
        if (sawAct) {
          blank();
          out.push('===');
        }
        sawAct = true;
        blank();
        out.push(`> **_${upperSafe(text.trim())}_** <`);
        inSpeech = false;
        break;
      case 'act_end':
        blank();
        out.push(`> **_${upperSafe(text.trim())}_** <`);
        inSpeech = false;
        break;
      case 'note':
        // Inside a speech the note rides along on its own line.
        if (!inSpeech) blank();
        out.push(`[[${text.trim().replace(/\n+/g, ' ')}]]`);
        break;
    }
  }
  return `${out.join('\n').trim()}\n`;
}
