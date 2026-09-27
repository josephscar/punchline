import { describe, expect, it } from 'vitest';
import { endOfActIndex, moveScene, sceneRange } from './scenes';
import { plainText, textElement as el } from './types';

const script = [
  el('act_start', 'COLD OPEN'), // 0
  el('scene_heading', 'A'), // 1
  el('action', 'a1'), // 2
  el('note', 'a-note'), // 3
  el('scene_heading', 'B'), // 4
  el('action', 'b1'), // 5
  el('act_end', 'END OF COLD OPEN'), // 6
  el('act_start', 'ACT ONE'), // 7
  el('scene_heading', 'C'), // 8
  el('action', 'c1'), // 9
];
const texts = (els: typeof script) => els.map(plainText);

describe('scenes', () => {
  it('finds the extent of a scene, notes included', () => {
    expect(sceneRange(script, 1)).toEqual([1, 4]);
    expect(sceneRange(script, 4)).toEqual([4, 6]);
    expect(sceneRange(script, 8)).toEqual([8, 10]);
  });

  it('moves a scene later in the script', () => {
    const moved = moveScene(script, 1, 6)!;
    expect(texts(moved.elements)).toEqual(['COLD OPEN', 'B', 'b1', 'A', 'a1', 'a-note', 'END OF COLD OPEN', 'ACT ONE', 'C', 'c1']);
    expect(moved.index).toBe(3);
  });

  it('moves a scene earlier, across acts', () => {
    const moved = moveScene(script, 8, 1)!;
    expect(texts(moved.elements)).toEqual(['COLD OPEN', 'C', 'c1', 'A', 'a1', 'a-note', 'B', 'b1', 'END OF COLD OPEN', 'ACT ONE']);
    expect(moved.index).toBe(1);
  });

  it('ignores drops onto the scene itself', () => {
    expect(moveScene(script, 4, 4)).toBeNull();
    expect(moveScene(script, 4, 6)).toBeNull();
  });

  it('knows where the end of each act is', () => {
    expect(endOfActIndex(script, 0)).toBe(6);
    expect(endOfActIndex(script, 7)).toBe(10);
  });
});
