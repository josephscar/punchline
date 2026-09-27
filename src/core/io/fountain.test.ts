import { describe, expect, it } from 'vitest';
import sample from '../__fixtures__/sample.fountain?raw';
import { singleCamSitcom as format } from '../formats/singleCamSitcom';
import { plainText, type ScriptElement } from '../types';
import { parseFountain, serializeFountain } from './fountain';
import { parseEmphasis, serializeEmphasis } from './inline';

const summary = (elements: ScriptElement[]) => elements.map((e) => `${e.kind}: ${plainText(e)}`);

describe('emphasis', () => {
  it('parses bold, italic, underline and escapes', () => {
    expect(parseEmphasis('a **b** *c* _d_ ***e*** \\*f\\*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', underline: true },
      { text: ' ' },
      { text: 'e', bold: true, italic: true },
      { text: ' *f*' },
    ]);
  });

  it('leaves unmatched markers alone', () => {
    expect(parseEmphasis('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15' }]);
  });

  it('round-trips', () => {
    const runs = [{ text: 'It was a ' }, { text: 'long', italic: true }, { text: ' lunch, ' }, { text: 'Gary', bold: true, underline: true }, { text: '. 2*2' }];
    expect(parseEmphasis(serializeEmphasis(runs))).toEqual(runs);
  });
});

describe('parseFountain', () => {
  const parsed = parseFountain(sample);

  it('reads the title page', () => {
    expect(parsed.titlePage).toMatchObject({
      title: 'PAPER TRAIL',
      episode: 'Pilot',
      credit: 'Written by',
      authors: 'Sam Rivera',
      draft: 'First Draft - 9/27/2026',
      contact: 'sam@example.com\n555-0100',
    });
  });

  it('recognises every element', () => {
    expect(summary(parsed.elements)).toEqual([
      'act_start: COLD OPEN',
      'scene_heading: INT. HOLLOWAY PAPER CO. - BULLPEN - DAY',
      'action: A drab open-plan office. DANA (30s, relentlessly upbeat) tapes a banner to a cubicle: WELCOME BACK, GARY!',
      'action: GARY (50s) enters, clutching a box of personal effects.',
      'character: GARY',
      'dialogue: Why is there a banner?',
      'character: DANA',
      'parenthetical: beaming',
      "dialogue: Because you're back!",
      'character: GARY',
      'dialogue: I was gone for lunch.',
      'note: Punch up this runner - maybe the banner falls?',
      'character: DANA',
      'dialogue: It was a long lunch.',
      'action: She checks her watch. Then checks it again.',
      'character: DANA',
      'parenthetical: sotto',
      'dialogue: Three hours.',
      'transition: SMASH CUT TO:',
      'scene_heading: INT. HOLLOWAY PAPER CO. - BREAK ROOM - CONTINUOUS',
      'shot: ANGLE ON',
      'action: The microwave. A burrito rotates, slowly, sadly.',
      'act_end: END OF COLD OPEN',
      'act_start: ACT ONE',
      'scene_heading: EXT. HOLLOWAY PAPER CO. - PARKING LOT - MORNING',
      'action: Dana sprints across the lot, late for the first time in her life.',
      'character: DANA (V.O.)',
      'dialogue: Rule number one of paper sales: never be late.',
      'act_end: END OF ACT ONE',
    ]);
    const lunch = parsed.elements[13];
    expect(lunch.runs).toEqual([{ text: 'It was a ' }, { text: 'long', italic: true }, { text: ' lunch.' }]);
  });

  it('handles forced elements, scene numbers, sections and inline notes', () => {
    const p = parseFountain(
      [
        '.FLASHBACK - HIGH SCHOOL',
        '',
        'INT. GYM - DAY #12#',
        '',
        '!SCREAMING',
        'continues.',
        '',
        '@McCLANE',
        'Yippee.',
        '',
        '> DISSOLVE',
        '',
        '# Act Two',
        '',
        '= The team regroups.',
        '',
        'The door opens. [[Is it locked?]]',
      ].join('\n'),
    );
    expect(summary(p.elements)).toEqual([
      'scene_heading: FLASHBACK - HIGH SCHOOL',
      'scene_heading: INT. GYM - DAY',
      'action: SCREAMING\ncontinues.',
      'character: McCLANE',
      'dialogue: Yippee.',
      'transition: DISSOLVE',
      'act_start: ACT TWO',
      'note: The team regroups.',
      'action: The door opens.',
      'note: Is it locked?',
    ]);
  });

  it('does not treat all-caps action as a character cue', () => {
    expect(summary(parseFountain('BOOM!\n\nThe lights go out.').elements)).toEqual(['action: BOOM!', 'action: The lights go out.']);
  });
});

describe('serializeFountain', () => {
  it('round-trips the sample script', () => {
    const parsed = parseFountain(sample);
    const text = serializeFountain(parsed, format);
    const again = parseFountain(text);
    expect(summary(again.elements)).toEqual(summary(parsed.elements));
    expect(again.titlePage).toEqual(parsed.titlePage);
    expect(again.elements.map((e) => e.runs)).toEqual(parsed.elements.map((e) => e.runs));
  });

  it('writes acts as centered bold-underlined lines with page breaks', () => {
    const text = serializeFountain(parseFountain(sample), format);
    expect(text).toContain('> **_COLD OPEN_** <');
    expect(text).toContain('===\n\n> **_ACT ONE_** <');
    expect(text).toContain('DANA\n(beaming)\nBecause you\'re back!');
    expect(text).toContain('[[Punch up this runner - maybe the banner falls?]]');
  });

  it('forces elements that would otherwise be misread', () => {
    const text = serializeFountain(
      {
        titlePage: parseFountain('').titlePage,
        elements: [
          { kind: 'action', runs: [{ text: 'INT. is how scripts start.' }] },
          { kind: 'scene_heading', runs: [{ text: 'Flashback' }] },
          { kind: 'character', runs: [{ text: 'McCLANE' }] },
          { kind: 'dialogue', runs: [{ text: 'Hi.' }] },
          { kind: 'transition', runs: [{ text: 'fade out.' }] },
        ],
      },
      format,
    );
    expect(text).toBe('!INT. is how scripts start.\n\n.FLASHBACK\n\nMCCLANE\nHi.\n\n> FADE OUT.\n');
  });
});
