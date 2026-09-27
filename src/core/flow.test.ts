import { describe, expect, it } from 'vitest';
import { detectOnEnter, detectWhileTyping, enterAction, nextInCycle } from './flow';
import { featureScreenplay } from './formats/featureScreenplay';
import { singleCamSitcom as format } from './formats/singleCamSitcom';

describe('Enter', () => {
  it('moves through the standard element flow', () => {
    expect(enterAction(format, 'scene_heading', 'INT. A - DAY', 12)).toEqual({ type: 'split', to: 'action' });
    expect(enterAction(format, 'action', 'Hi.', 3)).toEqual({ type: 'split', to: 'action' });
    expect(enterAction(format, 'character', 'PAM', 3)).toEqual({ type: 'split', to: 'dialogue' });
    expect(enterAction(format, 'parenthetical', 'beat', 4)).toEqual({ type: 'split', to: 'dialogue' });
    expect(enterAction(format, 'dialogue', 'Hi.', 3)).toEqual({ type: 'split', to: 'character' });
    expect(enterAction(format, 'transition', 'CUT TO:', 7)).toEqual({ type: 'split', to: 'scene_heading' });
    expect(enterAction(format, 'act_start', 'ACT ONE', 7)).toEqual({ type: 'split', to: 'scene_heading' });
    expect(enterAction(format, 'act_end', 'END OF ACT ONE', 14)).toEqual({ type: 'split', to: 'act_start' });
  });

  it('changes an empty element instead of adding another', () => {
    expect(enterAction(format, 'character', '', 0)).toEqual({ type: 'convert', to: 'action' });
    expect(enterAction(format, 'dialogue', '  ', 0)).toEqual({ type: 'convert', to: 'action' });
    expect(enterAction(format, 'action', '', 0)).toEqual({ type: 'convert', to: 'scene_heading' });
  });

  it('splits in the middle and pushes down at the start', () => {
    expect(enterAction(format, 'dialogue', 'Hello there', 5)).toEqual({ type: 'split', to: 'dialogue' });
    expect(enterAction(format, 'action', 'Hello', 0)).toEqual({ type: 'insertAbove' });
  });
});

describe('Tab', () => {
  it('cycles Scene Heading → Action → Character → Transition, text or not', () => {
    expect(nextInCycle(format, 'scene_heading')).toBe('action');
    expect(nextInCycle(format, 'action')).toBe('character');
    expect(nextInCycle(format, 'character')).toBe('transition');
    expect(nextInCycle(format, 'transition')).toBe('scene_heading');
  });

  it('goes backwards with Shift', () => {
    expect(nextInCycle(format, 'character', true)).toBe('action');
    expect(nextInCycle(format, 'scene_heading', true)).toBe('transition');
  });

  it('goes to Action from elements outside the cycle', () => {
    for (const kind of ['dialogue', 'parenthetical', 'shot', 'act_start', 'act_end', 'note'] as const) {
      expect(nextInCycle(format, kind)).toBe('action');
      expect(nextInCycle(format, kind, true)).toBe('action');
    }
  });

  it('is the same in every format', () => {
    expect(featureScreenplay.flow.tabCycle).toEqual(format.flow.tabCycle);
  });
});

describe('smart detection', () => {
  it('fixes the element type on Enter', () => {
    expect(detectOnEnter(format, 'action', 'int. office - day')).toBe('scene_heading');
    expect(detectOnEnter(format, 'action', 'SMASH CUT TO:')).toBe('transition');
    expect(detectOnEnter(format, 'action', 'smash cut to:')).toBe('transition');
    expect(detectOnEnter(format, 'action', 'WHIP PAN TO:')).toBe('transition');
    expect(detectOnEnter(format, 'action', 'She turns to:')).toBeNull();
    expect(detectOnEnter(format, 'action', 'act two')).toBe('act_start');
    expect(detectOnEnter(format, 'character', 'END OF ACT ONE')).toBe('act_end');
    expect(detectOnEnter(format, 'character', 'TAG')).toBeNull();
    expect(detectOnEnter(format, 'action', 'FADE OUT.')).toBe('transition');
    expect(detectOnEnter(format, 'action', 'FADE IN:')).toBeNull(); // stays at the left margin
    expect(detectOnEnter(format, 'action', 'ACT TWO')).toBe('act_start');
    expect(detectOnEnter(format, 'action', 'END OF ACT TWO')).toBe('act_end');
    expect(detectOnEnter(format, 'character', 'EXT. LOT - DAY')).toBe('scene_heading');
    expect(detectOnEnter(format, 'action', 'Dana walks to the door.')).toBeNull();
    expect(detectOnEnter(format, 'action', 'She is cut to: pieces')).toBeNull();
    expect(detectOnEnter(format, 'dialogue', 'CUT TO:')).toBeNull();
  });

  it('switches elements while typing', () => {
    expect(detectWhileTyping('action', 'int.')).toEqual({ to: 'scene_heading', strip: 0 });
    expect(detectWhileTyping('action', 'EXT ')).toEqual({ to: 'scene_heading', strip: 0 });
    expect(detectWhileTyping('action', 'Int')).toBeNull();
    expect(detectWhileTyping('action', 'Interesting')).toBeNull();
    expect(detectWhileTyping('dialogue', '(')).toEqual({ to: 'parenthetical', strip: 1 });
    expect(detectWhileTyping('action', '[[')).toEqual({ to: 'note', strip: 2 });
  });
});
