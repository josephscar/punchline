import { describe, expect, it } from 'vitest';
import { singleCamSitcom as format } from './formats/singleCamSitcom';
import { castOf, getSuggestions, rankCharacters, type SuggestionContext } from './suggestions';
import { textElement as el, type ElementKind, type ScriptElement } from './types';

function ctx(elements: ScriptElement[], index: number, kind: ElementKind, before: string, projectCast: Record<string, number> = {}): SuggestionContext {
  return { elements, index, kind, before, after: '', format, projectCast };
}

const scene = [
  el('scene_heading', 'INT. HOLLOWAY PAPER CO. - BULLPEN - DAY'),
  el('character', 'DANA'),
  el('dialogue', 'Welcome back!'),
  el('character', 'GARY'),
  el('dialogue', 'I went to lunch.'),
  el('character', ''), // index 5 — who's next?
];

describe('character suggestions', () => {
  it('predicts the other half of a conversation first', () => {
    const ranked = rankCharacters(scene, 5, {});
    expect(ranked[0]).toEqual({ name: 'DANA', detail: 'next in scene' });
    expect(ranked[1]).toEqual({ name: 'GARY', detail: 'just spoke' });
  });

  it('offers the cast of the project’s other scripts after this script’s cast', () => {
    const labels = getSuggestions(ctx(scene, 5, 'character', '', { MARCUS: 12, DANA: 3 })).map((s) => [s.label, s.detail]);
    expect(labels).toEqual([
      ['DANA', 'next in scene'],
      ['GARY', 'just spoke'],
      ['MARCUS', 'in project'],
    ]);
  });

  it('never suggests the half-typed cue itself', () => {
    const elements = [...scene.slice(0, 5), el('character', 'j')];
    expect(getSuggestions(ctx(elements, 5, 'character', 'j')).map((s) => s.label)).toEqual([]);
  });

  it('filters by what has been typed, matching any word of the name', () => {
    const elements = [...scene.slice(0, 5), el('character', 'MRS. DOUBTFIRE'), el('dialogue', 'Hello.'), el('character', '')];
    expect(getSuggestions(ctx(elements, 7, 'character', 'g')).map((s) => s.label)).toEqual(['GARY']);
    expect(getSuggestions(ctx(elements, 7, 'character', 'dou')).map((s) => s.label)).toEqual(['MRS. DOUBTFIRE']);
  });

  it('completes extensions after an open parenthesis', () => {
    const s = getSuggestions(ctx(scene, 5, 'character', 'DANA (v'));
    expect(s[0]).toMatchObject({ label: '(V.O.)', insert: '(V.O.)', from: 5 });
  });

  it('puts an exact match first so Enter keeps what was typed', () => {
    const elements = [...scene.slice(0, 5), el('character', 'GARYSON'), el('dialogue', 'Hi.'), el('character', '')];
    expect(getSuggestions(ctx(elements, 7, 'character', 'gary')).map((s) => s.label)).toEqual(['GARY', 'GARYSON']);
  });

  it('counts the characters who speak, with their number of speeches', () => {
    const elements = [
      ...scene.slice(0, 5),
      el('character', 'DANA (CONT’D)'),
      el('parenthetical', '(quietly)'),
      el('dialogue', 'Anyway.'),
    ];
    expect(castOf(elements)).toEqual({ DANA: 2, GARY: 1 });
  });

  it('only suggests names that are in the script now', () => {
    // A typo that was corrected, and a character whose every line was deleted, are gone.
    const elements = [...scene.slice(0, 5), el('character', 'JAKE'), el('dialogue', 'Hey.'), el('character', '')];
    expect(getSuggestions(ctx(elements, 7, 'character', 'j')).map((s) => s.label)).toEqual(['JAKE']);
    expect(getSuggestions(ctx(elements, 7, 'character', 'mis')).map((s) => s.label)).toEqual([]);
  });

  it('ignores a cue nobody has said anything under yet', () => {
    // "JAK" + Enter leaves an empty speech behind; it isn't a character until it has dialogue.
    const elements = [...scene.slice(0, 5), el('character', 'JAK'), el('dialogue', ''), el('character', '')];
    expect(getSuggestions(ctx(elements, 7, 'character', 'j')).map((s) => s.label)).toEqual([]);
    expect(castOf(elements)).toEqual({ DANA: 1, GARY: 1 });
  });
});

describe('scene heading suggestions', () => {
  it('starts with INT./EXT.', () => {
    const s = getSuggestions(ctx([el('scene_heading', '')], 0, 'scene_heading', ''));
    expect(s.map((x) => x.label)).toEqual(format.vocabulary.sceneIntros);
    expect(s[0]).toMatchObject({ insert: 'INT. ', chain: true });
    expect(getSuggestions(ctx([el('scene_heading', '')], 0, 'scene_heading', 'e')).map((x) => x.label)).toEqual(['EXT.', 'EXT./INT.']);
  });

  it('suggests locations already used, then times of day', () => {
    const elements = [...scene, el('scene_heading', 'INT. ')];
    const locations = getSuggestions(ctx(elements, 6, 'scene_heading', 'INT. hol'));
    expect(locations[0]).toMatchObject({ label: 'HOLLOWAY PAPER CO. - BULLPEN', insert: 'HOLLOWAY PAPER CO. - BULLPEN - ', from: 5 });
    const times = getSuggestions(ctx(elements, 6, 'scene_heading', 'INT. KITCHEN - n'));
    expect(times[0]).toMatchObject({ label: 'NIGHT', insert: 'NIGHT', from: 15 });
    const all = getSuggestions(ctx(elements, 6, 'scene_heading', 'INT. KITCHEN - '));
    expect(all.map((x) => x.label).slice(0, 3)).toEqual(['DAY', 'NIGHT', 'CONTINUOUS']);
  });

  it('keeps matching multi-part locations after a dash', () => {
    const elements = [...scene, el('scene_heading', '')];
    const s = getSuggestions(ctx(elements, 6, 'scene_heading', 'INT. HOLLOWAY PAPER CO. - BU'));
    expect(s[0].label).toBe('HOLLOWAY PAPER CO. - BULLPEN');
  });
});

describe('other elements', () => {
  it('suggests the next act and the matching END OF line', () => {
    const elements = [el('act_start', 'COLD OPEN'), el('scene_heading', 'INT. A - DAY'), el('act_end', ''), el('act_start', '')];
    expect(getSuggestions(ctx(elements, 2, 'act_end', ''))[0].label).toBe('END OF COLD OPEN');
    expect(getSuggestions(ctx(elements, 3, 'act_start', ''))[0].label).toBe('ACT ONE');
  });

  it('completes transitions and shots', () => {
    expect(getSuggestions(ctx([], 0, 'transition', 'sm'))[0].label).toBe('SMASH CUT TO:');
    expect(getSuggestions(ctx([], 0, 'shot', 'back'))[0].label).toBe('BACK TO SCENE');
  });

  it('offers character names inside "(to …)" parentheticals', () => {
    const s = getSuggestions(ctx(scene, 5, 'parenthetical', 'to g'));
    expect(s[0]).toMatchObject({ label: 'to GARY', insert: 'GARY', from: 3 });
  });

  it('only completes at the end of the text', () => {
    expect(getSuggestions({ ...ctx(scene, 5, 'character', 'D'), after: 'ANA' })).toEqual([]);
  });
});
