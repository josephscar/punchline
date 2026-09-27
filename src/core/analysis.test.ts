import { describe, expect, it } from 'vitest';
import {
  analyzeScript,
  autoContdCues,
  characterExtensions,
  characterName,
  currentActName,
  looksLikeSceneHeading,
  parseSceneHeading,
} from './analysis';
import { textElement as el } from './types';

describe('scene headings', () => {
  it('splits intro, location and time', () => {
    expect(parseSceneHeading('int. dunder mifflin - bullpen - day')).toEqual({
      intro: 'INT.',
      location: 'DUNDER MIFFLIN - BULLPEN',
      time: 'DAY',
    });
    expect(parseSceneHeading('EXT. PARKING LOT - MOMENTS LATER').time).toBe('MOMENTS LATER');
    expect(parseSceneHeading('INT./EXT. CAR - NIGHT')).toEqual({ intro: 'INT./EXT.', location: 'CAR', time: 'NIGHT' });
  });

  it('does not mistake the last part of a location for a time', () => {
    expect(parseSceneHeading('INT. OFFICE - KITCHEN')).toEqual({ intro: 'INT.', location: 'OFFICE - KITCHEN', time: '' });
  });

  it('recognises scene heading openers', () => {
    expect(looksLikeSceneHeading('INT. HOUSE')).toBe(true);
    expect(looksLikeSceneHeading('ext house')).toBe(true);
    expect(looksLikeSceneHeading('I/E. CAR')).toBe(true);
    expect(looksLikeSceneHeading('Interesting.')).toBe(false);
    expect(looksLikeSceneHeading('Exterior walls crumble')).toBe(false);
  });
});

describe('character cues', () => {
  it('extracts the name and extensions', () => {
    expect(characterName('pam (V.O.)')).toBe('PAM');
    expect(characterName("MICHAEL (O.S.) (CONT'D)")).toBe('MICHAEL');
    expect(characterName('DR. SPACEMAN ^')).toBe('DR. SPACEMAN');
    expect(characterExtensions("PAM (v.o.) (cont'd)")).toEqual(['V.O.', "CONT'D"]);
  });

  it("marks cues that need (CONT'D)", () => {
    const elements = [
      el('scene_heading', 'INT. A - DAY'),
      el('character', 'PAM'), // 1
      el('dialogue', 'Hi.'),
      el('action', 'She waves.'),
      el('character', 'PAM'), // 4 → contd
      el('dialogue', 'Again.'),
      el('character', 'JIM'), // 6
      el('dialogue', 'Hey.'),
      el('scene_heading', 'INT. B - DAY'),
      el('character', 'JIM'), // 9 new scene → no
      el('dialogue', 'Yo.'),
      el('character', "JIM (CONT'D)"), // 11 already has it
    ];
    expect(Array.from(autoContdCues(elements))).toEqual([4]);
  });
});

describe('analyzeScript', () => {
  const elements = [
    el('act_start', 'COLD OPEN'),
    el('scene_heading', 'INT. OFFICE - DAY'),
    el('action', 'Dana tapes a banner.'),
    el('character', 'DANA'),
    el('dialogue', 'Welcome back!'),
    el('character', 'GARY'),
    el('dialogue', 'I went to lunch.'),
    el('note', 'Punch this up'),
    el('act_end', 'END OF COLD OPEN'),
    el('act_start', 'ACT ONE'),
    el('scene_heading', 'EXT. OFFICE - NIGHT'),
    el('character', 'DANA (V.O.)'),
    el('dialogue', 'Later.'),
  ];

  it('groups scenes into acts', () => {
    const a = analyzeScript(elements);
    expect(a.acts.map((x) => [x.name, x.scenes.map((s) => s.number)])).toEqual([
      ['COLD OPEN', [1]],
      ['ACT ONE', [2]],
    ]);
    expect(a.scenes[0]).toMatchObject({ heading: 'INT. OFFICE - DAY', synopsis: 'Dana tapes a banner.', characters: ['DANA', 'GARY'] });
    expect(a.locations).toEqual(['OFFICE']);
  });

  it('counts characters and collects notes', () => {
    const a = analyzeScript(elements);
    expect(a.characters.map((c) => [c.name, c.speeches, c.scenes, c.words])).toEqual([
      ['DANA', 2, 2, 3],
      ['GARY', 1, 1, 4],
    ]);
    expect(a.notes).toEqual([{ index: 7, text: 'Punch this up', scene: 'INT. OFFICE - DAY' }]);
  });

  it('knows which act the cursor is in', () => {
    expect(currentActName(elements, 7)).toBe('COLD OPEN');
    expect(currentActName(elements, 9)).toBe('ACT ONE');
    expect(currentActName([el('scene_heading', 'INT. A - DAY')], 0)).toBeNull();
  });
});
