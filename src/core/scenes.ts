import type { ScriptElement } from './types';

/**
 * Scene-level editing: a scene runs from its heading up to the next scene
 * heading or act break, and carries its action, dialogue and notes with it.
 */

const BOUNDARY = new Set(['scene_heading', 'act_start', 'act_end']);

/** [start, end) of the scene whose heading is at `index`. */
export function sceneRange(elements: ScriptElement[], index: number): [number, number] {
  let end = index + 1;
  while (end < elements.length && !BOUNDARY.has(elements[end].kind)) end++;
  return [index, end];
}

/**
 * Where a scene dropped at the end of an act should go: just before that
 * act's END OF line, or before the next act if there is none.
 */
export function endOfActIndex(elements: ScriptElement[], actIndex: number): number {
  for (let i = actIndex + 1; i < elements.length; i++) {
    if (elements[i].kind === 'act_end' || elements[i].kind === 'act_start') return i;
  }
  return elements.length;
}

/**
 * Move the scene whose heading is at `sceneIndex` so it sits just before
 * element `target` (an index into the original list). Returns the new list
 * and the scene's new heading index, or null when nothing would change.
 */
export function moveScene(
  elements: ScriptElement[],
  sceneIndex: number,
  target: number,
): { elements: ScriptElement[]; index: number } | null {
  const [start, end] = sceneRange(elements, sceneIndex);
  if (target >= start && target <= end) return null;
  const block = elements.slice(start, end);
  const rest = [...elements.slice(0, start), ...elements.slice(end)];
  const at = target > end ? target - block.length : target;
  rest.splice(at, 0, ...block);
  return { elements: rest, index: at };
}
