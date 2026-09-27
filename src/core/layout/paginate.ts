import { autoContdCues, characterExtensions, characterName } from '../analysis';
import type { ElementStyle, ScriptFormat } from '../formats';
import { normalizeRuns, type ElementKind, type Script, type ScriptElement, type TextRun } from '../types';
import { wrapText } from './wrap';

/**
 * Pagination engine: turns a script into printed pages, following the
 * usual screenplay rules —
 *  • blank "space before" lines are dropped at the top of a page;
 *  • scene headings, shots and act titles are never stranded at the bottom;
 *  • action splits between sentences, keeping at least two lines each side;
 *  • dialogue splits with (MORE) at the bottom and NAME (CONT'D) on top,
 *    otherwise the whole speech moves to the next page;
 *  • elements marked `startsPage` (acts) always begin a new page.
 *
 * All positions are in character cells: x is measured in characters from
 * the left text margin, y in lines from the top margin.
 */

export type LineKind = ElementKind | 'more' | 'contd';

export interface LayoutLine {
  y: number;
  x: number;
  runs: TextRun[];
  kind: LineKind;
  /** Source element, or -1 for generated lines like (MORE). */
  elementIndex: number;
  lineInElement: number;
  /** Set on the first line of a numbered scene heading. */
  sceneNumber?: number;
}

export interface LayoutPage {
  number: number;
  lines: LayoutLine[];
}

export interface PageStart {
  page: number;
  elementIndex: number;
  lineInElement: number;
}

export interface ScriptLayout {
  pages: LayoutPage[];
  /** 1-based page on which each element starts (notes/empties: page they sit on). */
  elementPages: number[];
  /** Where pages 2, 3, … begin in the source, for page-break markers in the editor. */
  pageStarts: PageStart[];
  /** Character cues printed with an automatic (CONT'D). */
  contdCues: Set<number>;
  /** Scene number for each scene heading element index. */
  sceneNumbers: Map<number, number>;
}

interface FLine {
  x: number;
  runs: TextRun[];
  text: string;
  kind: LineKind;
  elementIndex: number;
  lineInElement: number;
  role: 'header' | 'paren' | 'dialogue' | 'other';
  sceneNumber?: number;
}

/** Uppercase without changing string length (keeps run offsets valid). */
export function upperSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    const up = ch.toUpperCase();
    out += up.length === ch.length ? up : ch;
  }
  return out;
}

function sliceRuns(runs: TextRun[], start: number, end: number): TextRun[] {
  const out: TextRun[] = [];
  let pos = 0;
  for (const run of runs) {
    const runEnd = pos + run.text.length;
    const s = Math.max(start, pos);
    const e = Math.min(end, runEnd);
    if (s < e) out.push({ ...run, text: run.text.slice(s - pos, e - pos) });
    pos = runEnd;
  }
  return out;
}

/** The text a character cue prints with, including any automatic (CONT'D). */
export function characterCueText(text: string, contd: boolean, format: ScriptFormat): string {
  const upper = upperSafe(text.trim());
  return contd ? `${upper} ${format.contd}` : upper;
}

export function formatElementLines(
  el: ScriptElement,
  elementIndex: number,
  style: ElementStyle,
  options: { contd?: boolean; format: ScriptFormat },
): FLine[] {
  let runs = normalizeRuns(el.runs);
  if (style.caps) runs = runs.map((r) => ({ ...r, text: upperSafe(r.text) }));
  if (el.kind === 'character' && options.contd) runs = [...runs, { text: ` ${options.format.contd}` }];
  const content = runs.map((r) => r.text).join('');
  if (!content.trim()) return [];
  if (style.wrapWith) {
    const [open, close] = style.wrapWith;
    const trimmed = content.trim();
    if (!(trimmed.startsWith(open) && trimmed.endsWith(close))) {
      runs = [{ text: open }, ...runs, { text: close }];
    }
  }
  if (style.bold || style.underline) {
    runs = runs.map((r) => ({
      ...r,
      bold: r.bold || style.bold || undefined,
      underline: r.underline || style.underline || undefined,
    }));
  }
  const text = runs.map((r) => r.text).join('');
  const hanging = style.hangingIndent ?? 0;
  const ranges = wrapText(text, style.width, style.width - hanging);
  const role: FLine['role'] =
    el.kind === 'character' ? 'header' : el.kind === 'parenthetical' ? 'paren' : el.kind === 'dialogue' ? 'dialogue' : 'other';
  return ranges.map(([s, e], i) => {
    const lineText = text.slice(s, e);
    const lineWidth = i === 0 ? style.width : style.width - hanging;
    let x = style.indent + (i === 0 ? 0 : hanging);
    if (style.align === 'center') x += Math.floor((lineWidth - lineText.length) / 2);
    if (style.align === 'right') x += lineWidth - lineText.length;
    return {
      x,
      runs: sliceRuns(runs, s, e),
      text: lineText,
      kind: el.kind,
      elementIndex,
      lineInElement: i,
      role,
    };
  });
}

const SENTENCE_END = /([.!?…]|--|—)["'”’)]*$/;

interface Unit {
  speech: boolean;
  first: ElementStyle;
  kind: ElementKind;
  lines: FLine[];
  characterText?: string;
}

export function layoutScript(script: Pick<Script, 'elements' | 'settings'>, format: ScriptFormat): ScriptLayout {
  const { elements, settings } = script;
  const L = format.page.linesPerPage;
  const contdCues = settings.autoContd ? autoContdCues(elements) : new Set<number>();

  const sceneNumbers = new Map<number, number>();
  elements.forEach((el, i) => {
    if (el.kind === 'scene_heading' && el.runs.some((r) => r.text.trim())) sceneNumbers.set(i, sceneNumbers.size + 1);
  });

  // ---- 1. Group elements into units (a speech is one unit). ----
  const units: Unit[] = [];
  let speech: Unit | null = null;
  elements.forEach((el, i) => {
    const style = format.elements[el.kind];
    if (!style.printable) return;
    const lines = formatElementLines(el, i, style, { contd: contdCues.has(i), format });
    if (!lines.length) return;
    if (settings.sceneNumbers && el.kind === 'scene_heading') lines[0].sceneNumber = sceneNumbers.get(i);
    if (el.kind === 'character') {
      speech = { speech: true, first: style, kind: el.kind, lines, characterText: lines.map((l) => l.text).join(' ') };
      units.push(speech);
      return;
    }
    if (speech && (el.kind === 'dialogue' || el.kind === 'parenthetical')) {
      speech.lines.push(...lines);
      return;
    }
    speech = null;
    units.push({ speech: false, first: style, kind: el.kind, lines });
  });

  // ---- 2. Flow units onto pages. ----
  const pages: LayoutPage[] = [{ number: 1, lines: [] }];
  let y = 0;
  /** Start of a run of keep-with-next units at the bottom of the current page. */
  let dangling: { lineIndex: number } | null = null;

  const current = () => pages[pages.length - 1];

  const newPage = () => {
    pages.push({ number: pages.length + 1, lines: [] });
    y = 0;
  };

  const emit = (lines: FLine[], spaceBefore: number) => {
    y += spaceBefore;
    for (const l of lines) {
      const out: LayoutLine = {
        y,
        x: l.x,
        runs: l.runs,
        kind: l.kind,
        elementIndex: l.elementIndex,
        lineInElement: l.lineInElement,
      };
      if (l.sceneNumber) out.sceneNumber = l.sceneNumber;
      current().lines.push(out);
      y++;
    }
  };

  /** Start a new page, bringing along any heading that would be stranded. */
  const breakPage = () => {
    const page = current();
    if (dangling && dangling.lineIndex > 0) {
      const carried = page.lines.splice(dangling.lineIndex);
      newPage();
      const shift = carried[0].y;
      for (const line of carried) current().lines.push({ ...line, y: line.y - shift });
      y = carried[carried.length - 1].y - shift + 1;
      dangling = { lineIndex: 0 };
    } else {
      newPage();
      dangling = null;
    }
  };

  const chooseSplit = (lines: FLine[], room: number, minBefore: number, minAfter: number, ok: (l: FLine) => boolean) => {
    let best = 0;
    for (let k = Math.min(room, lines.length - minAfter); k >= minBefore; k--) {
      if (!ok(lines[k - 1])) continue;
      if (SENTENCE_END.test(lines[k - 1].text)) return k;
      if (!best) best = k;
    }
    return best;
  };

  const placeSingle = (unit: Unit) => {
    const style = unit.first;
    if (style.startsPage && current().lines.length > 0) {
      newPage();
      dangling = null;
    }
    const startLine = current().lines.length;
    let rest = unit.lines;
    let first = true;
    while (rest.length) {
      const sb = y === 0 ? 0 : first ? style.spaceBefore : 0;
      const avail = L - y - sb;
      if (rest.length <= avail) {
        emit(rest, sb);
        break;
      }
      let k = unit.kind === 'action' ? chooseSplit(rest, avail, 2, 2, () => true) : 0;
      if (!k && y === 0) k = avail; // longer than a whole page
      if (k > 0) {
        emit(rest.slice(0, k), sb);
        rest = rest.slice(k);
        newPage();
        dangling = null;
        first = false;
        continue;
      }
      breakPage();
    }
    if (style.keepWithNext) {
      if (!dangling) dangling = { lineIndex: Math.min(startLine, current().lines.length - unit.lines.length) };
    } else {
      dangling = null;
    }
  };

  const contdHeader = (unit: Unit, x: number): FLine => {
    const cueText = unit.characterText ?? '';
    const name = characterName(cueText);
    const exts = characterExtensions(cueText).filter((e) => !/^CONT['’]?D$/.test(e));
    const label = [name, ...exts.map((e) => `(${e})`), format.contd].join(' ');
    return { x, runs: [{ text: label }], text: label, kind: 'contd', elementIndex: -1, lineInElement: 0, role: 'header' };
  };

  const placeSpeech = (unit: Unit) => {
    const style = unit.first;
    const x = unit.lines[0].x;
    let rest = unit.lines;
    let headerCount = rest.filter((l) => l.role === 'header').length;
    let first = true;
    while (true) {
      const sb = y === 0 ? 0 : first ? style.spaceBefore : 0;
      const avail = L - y - sb;
      if (rest.length <= avail) {
        emit(rest, sb);
        break;
      }
      // Leave a line for (MORE); split after a line of dialogue.
      let k = chooseSplit(rest, avail - 1, headerCount + 2, 2, (l) => l.role === 'dialogue');
      if (!k) {
        if (y > 0) {
          breakPage();
          first = true;
          continue;
        }
        k = Math.max(headerCount + 1, avail - 1);
      }
      emit(rest.slice(0, k), sb);
      emit([{ x, runs: [{ text: format.more }], text: format.more, kind: 'more', elementIndex: -1, lineInElement: 0, role: 'other' }], 0);
      newPage();
      dangling = null;
      rest = [contdHeader(unit, x), ...rest.slice(k)];
      headerCount = 1;
      first = false;
    }
    dangling = null;
  };

  for (const unit of units) {
    if (unit.speech) placeSpeech(unit);
    else placeSingle(unit);
  }

  // ---- 3. Index pages by source element. ----
  const elementPages: number[] = new Array(elements.length).fill(0);
  const pageStarts: PageStart[] = [];
  for (const page of pages) {
    let marked = false;
    for (const line of page.lines) {
      if (line.elementIndex < 0) continue;
      if (!elementPages[line.elementIndex]) elementPages[line.elementIndex] = page.number;
      if (!marked && page.number > 1) {
        pageStarts.push({ page: page.number, elementIndex: line.elementIndex, lineInElement: line.lineInElement });
        marked = true;
      }
    }
  }
  let last = 1;
  for (let i = 0; i < elementPages.length; i++) {
    if (elementPages[i]) last = elementPages[i];
    else elementPages[i] = last;
  }

  return { pages, elementPages, pageStarts, contdCues, sceneNumbers };
}
