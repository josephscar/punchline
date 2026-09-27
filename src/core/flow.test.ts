import { describe, expect, it } from 'vitest';
import { detectOnEnter, detectWhileTyping, enterAction, tabAction } from './flow';
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
  it('cycles empty elements', () => {
    expect(tabAction(format, 'action', '', 0, false)).toEqual({ type: 'convert', to: 'character' });
    expect(tabAction(format, 'character', '', 0, false)).toEqual({ type: 'convert', to: 'transition' });
    expect(tabAction(format, 'transition', '', 0, false)).toEqual({ type: 'convert', to: 'scene_heading' });
    expect(tabAction(format, 'dialogue', '', 0, false)).toEqual({ type: 'convert', to: 'parenthetical' });
    expect(tabAction(format, 'character', '', 0, true)).toEqual({ type: 'convert', to: 'action' });
  });

  it('adds a parenthetical after or inside dialogue', () => {
    expect(tabAction(format, 'dialogue', 'Hi.', 3, false)).toEqual({ type: 'split', to: 'parenthetical' });
    expect(tabAction(format, 'dialogue', 'Hi. Bye.', 4, false)).toEqual({ type: 'splitWith', insert: 'parenthetical', rest: 'dialogue' });
    expect(tabAction(format, 'action', 'She waves.', 10, false)).toEqual({ type: 'split', to: 'character' });
    expect(tabAction(format, 'action', 'She waves.', 3, false)).toEqual({ type: 'none' });
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
