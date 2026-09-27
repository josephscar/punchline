import { looksLikeSceneHeading } from './analysis';
import type { ScriptFormat } from './formats';
import type { ElementKind } from './types';

/**
 * Keyboard flow: what Enter does in each element (the way Final Draft and
 * WriterDuet behave) and the Tab cycle of element types. Kept free of
 * editor code so it can be tested and reused by other front-ends.
 */

export type FlowAction =
  /** Change the current element's type. */
  | { type: 'convert'; to: ElementKind }
  /** Split at the cursor; the new element (after the cursor) gets `to`. */
  | { type: 'split'; to: ElementKind }
  /** Cursor at the very start: push the element down with an empty one of the same type. */
  | { type: 'insertAbove' };

export function enterAction(format: ScriptFormat, kind: ElementKind, text: string, offset: number): FlowAction {
  if (!text.trim()) {
    const to = format.flow.emptyEnter[kind];
    return to ? { type: 'convert', to } : { type: 'split', to: format.flow.enter[kind] };
  }
  if (offset >= text.trimEnd().length) return { type: 'split', to: format.flow.enter[kind] };
  if (offset === 0) return { type: 'insertAbove' };
  return { type: 'split', to: kind };
}

/**
 * Tab / Shift+Tab: the element type after (or before) `kind` in the
 * format's cycle, wrapping around. Works the same whether or not the element
 * has text, so Tab is always "change what this line is".
 */
export function nextInCycle(format: ScriptFormat, kind: ElementKind, backwards = false): ElementKind {
  const cycle = format.flow.tabCycle;
  const at = cycle.indexOf(kind);
  if (at === -1) return cycle[0];
  const step = backwards ? -1 : 1;
  return cycle[(at + step + cycle.length) % cycle.length];
}

const ACT_NAME = /^(COLD OPEN|TEASER|PROLOGUE|EPILOGUE|TAG|ACT (ONE|TWO|THREE|FOUR|FIVE|SIX|\d+))$/;

/**
 * When Enter is pressed, a line typed in the "wrong" element is moved to the
 * right one: "cut to:" in Action becomes a Transition, "ACT TWO" becomes a
 * New Act, and so on. Returns null when nothing should change.
 */
export function detectOnEnter(format: ScriptFormat, kind: ElementKind, text: string): ElementKind | null {
  const t = text.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (kind === 'action' || kind === 'character') {
    if (looksLikeSceneHeading(t)) return 'scene_heading';
    // A one-word act name ("TAG") in a Character line is more likely a name.
    if (ACT_NAME.test(upper) && (kind === 'action' || upper.includes(' '))) return 'act_start';
    if (/^END OF (THE )?(COLD OPEN|TEASER|ACT (ONE|TWO|THREE|FOUR|FIVE|SIX|\d+)|TAG|SHOW|EPISODE)$/.test(upper)) return 'act_end';
    // Known transitions in any case; other "… TO:" lines only when typed in capitals.
    if (format.vocabulary.transitions.includes(upper) || (t === upper && /^[A-Z .]+TO:$/.test(upper))) return 'transition';
  }
  return null;
}

/**
 * Checked after every keystroke: typing "int." at the start of an Action
 * turns it into a Scene Heading, "(" at the start of Dialogue makes a
 * Parenthetical, "[[" starts a Note. Returns the new kind and how many
 * leading characters to remove, or null.
 */
export function detectWhileTyping(kind: ElementKind, text: string): { to: ElementKind; strip: number } | null {
  if (text === '[[' && kind !== 'note') return { to: 'note', strip: 2 };
  if ((kind === 'action' || kind === 'character') && /^(int|ext|est|i\/e|int\.?\/ext|ext\.?\/int)(\.| )$/i.test(text)) {
    return { to: 'scene_heading', strip: 0 };
  }
  if (kind === 'dialogue' && text === '(') return { to: 'parenthetical', strip: 1 };
  if (kind === 'parenthetical' && text === '(') return { to: 'parenthetical', strip: 1 };
  return null;
}
