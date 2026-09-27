import { describe, expect, it } from 'vitest';
import { singleCamSitcom as format } from '../formats/singleCamSitcom';
import { defaultSettings, textElement, type ElementKind, type ScriptElement } from '../types';
import { layoutScript, type LayoutPage } from './paginate';

const el = (kind: ElementKind, text: string) => textElement(kind, text);
const layout = (elements: ScriptElement[], settings = defaultSettings()) => layoutScript({ elements, settings }, format);
const text = (page: LayoutPage) => page.lines.map((l) => ' '.repeat(Math.max(0, l.x)) + l.runs.map((r) => r.text).join(''));
/** Action long enough to take `n` lines (60 chars per line). */
const actionLines = (n: number) => Array.from({ length: n }, (_, i) => `Line${String(i).padStart(2, '0')} ${'x'.repeat(52)}.`).join(' ');

describe('layoutScript', () => {
  it('places elements at their indents with space before', () => {
    const { pages } = layout([
      el('scene_heading', 'int. kitchen - day'),
      el('action', 'Dana enters.'),
      el('character', 'dana'),
      el('parenthetical', 'beat'),
      el('dialogue', 'Hi.'),
      el('transition', 'cut to:'),
    ]);
    expect(pages).toHaveLength(1);
    const lines = pages[0].lines;
    expect(lines.map((l) => [l.y, l.x, l.kind])).toEqual([
      [0, 0, 'scene_heading'],
      [2, 0, 'action'],
      [4, 22, 'character'],
      [5, 16, 'parenthetical'],
      [6, 10, 'dialogue'],
      [8, 60 - 'CUT TO:'.length, 'transition'],
    ]);
    expect(text(pages[0])[0]).toBe('INT. KITCHEN - DAY');
    expect(lines[3].runs.map((r) => r.text).join('')).toBe('(beat)');
  });

  it('centers act headings in bold underline and starts each act on a new page', () => {
    const { pages } = layout([
      el('act_start', 'cold open'),
      el('scene_heading', 'INT. OFFICE - DAY'),
      el('act_end', 'end of cold open'),
      el('act_start', 'act one'),
      el('scene_heading', 'INT. OFFICE - NIGHT'),
    ]);
    expect(pages).toHaveLength(2);
    const heading = pages[0].lines[0];
    expect(heading.x).toBe(Math.floor((60 - 'COLD OPEN'.length) / 2));
    expect(heading.runs[0]).toMatchObject({ text: 'COLD OPEN', bold: true, underline: true });
    expect(pages[1].lines[0].runs[0].text).toBe('ACT ONE');
    expect(pages[1].lines[0].y).toBe(0);
  });

  it('never prints notes or empty elements', () => {
    const { pages, elementPages } = layout([el('action', 'Hello.'), el('note', 'secret'), el('action', ''), el('action', 'Bye.')]);
    expect(pages[0].lines.map((l) => l.runs[0].text)).toEqual(['Hello.', 'Bye.']);
    expect(pages[0].lines[1].y).toBe(2);
    expect(elementPages).toEqual([1, 1, 1, 1]);
  });

  it('adds (CONT\'D) when a character keeps talking after action', () => {
    const { pages, contdCues } = layout([
      el('scene_heading', 'INT. OFFICE - DAY'),
      el('character', 'DANA'),
      el('dialogue', 'One.'),
      el('action', 'She sips.'),
      el('character', 'DANA'),
      el('dialogue', 'Two.'),
    ]);
    expect(contdCues.has(4)).toBe(true);
    expect(text(pages[0])).toContain(`${' '.repeat(22)}DANA (CONT'D)`);
  });

  it('splits long action between pages, keeping two lines on each side', () => {
    const { pages, pageStarts } = layout([el('action', actionLines(50)), el('action', actionLines(10))]);
    // 50 lines fit; three lines remain for the second action, which splits 3 / 7.
    expect(pages).toHaveLength(2);
    const firstPageActionLines = pages[0].lines.filter((l) => l.elementIndex === 1).length;
    expect(firstPageActionLines).toBeGreaterThanOrEqual(2);
    expect(pages[1].lines[0].y).toBe(0);
    expect(pageStarts[0]).toEqual({ page: 2, elementIndex: 1, lineInElement: firstPageActionLines });
  });

  it('moves a scene heading that would be stranded at the bottom of a page', () => {
    const { pages } = layout([
      el('action', actionLines(52)),
      el('scene_heading', 'INT. OFFICE - DAY'),
      el('action', actionLines(3)),
    ]);
    // 52 lines + blank + heading = 54: the heading fits but nothing after it does.
    expect(pages).toHaveLength(2);
    expect(pages[0].lines.some((l) => l.kind === 'scene_heading')).toBe(false);
    expect(pages[1].lines[0]).toMatchObject({ kind: 'scene_heading', y: 0 });
  });

  it('splits long dialogue with (MORE) and NAME (CONT\'D)', () => {
    const speech = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} goes here.`).join(' ');
    const { pages } = layout([el('action', actionLines(44)), el('character', 'GARY (O.S.)'), el('dialogue', speech)]);
    expect(pages).toHaveLength(2);
    const bottom = pages[0].lines[pages[0].lines.length - 1];
    expect(bottom).toMatchObject({ kind: 'more', x: 22 });
    expect(bottom.runs[0].text).toBe('(MORE)');
    expect(pages[1].lines[0].runs[0].text).toBe("GARY (O.S.) (CONT'D)");
    expect(pages[1].lines[1].kind).toBe('dialogue');
    expect(pages[0].lines.length + 0).toBeLessThanOrEqual(54);
    expect(Math.max(...pages[0].lines.map((l) => l.y))).toBeLessThan(54);
  });

  it('moves a whole speech when there is no room to split it well', () => {
    const { pages } = layout([el('action', actionLines(51)), el('character', 'DANA'), el('dialogue', 'Short line one. And a second line that wraps around the page.')]);
    expect(pages).toHaveLength(2);
    expect(pages[1].lines[0]).toMatchObject({ kind: 'character', y: 0 });
  });

  it('numbers scenes when asked', () => {
    const settings = { ...defaultSettings(), sceneNumbers: true };
    const { pages, sceneNumbers } = layout([el('scene_heading', 'INT. A - DAY'), el('action', 'x'), el('scene_heading', 'EXT. B - NIGHT')], settings);
    expect(sceneNumbers.get(2)).toBe(2);
    expect(pages[0].lines.filter((l) => l.sceneNumber).map((l) => l.sceneNumber)).toEqual([1, 2]);
  });

  it('never exceeds the page length', () => {
    const elements: ScriptElement[] = [];
    for (let i = 0; i < 40; i++) {
      elements.push(el('scene_heading', `INT. ROOM ${i} - DAY`), el('action', actionLines(i % 7)), el('character', 'DANA'), el('dialogue', actionLines(i % 5 + 1)));
    }
    const { pages } = layout(elements);
    for (const page of pages) {
      for (const line of page.lines) expect(line.y).toBeLessThan(format.page.linesPerPage);
      const ys = page.lines.map((l) => l.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });
});
