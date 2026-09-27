import { plainText, type ScriptElement } from './types';

/**
 * Comparing drafts: which elements were added, removed or changed between
 * two versions of a script, and which words changed inside a changed line.
 */

export type DiffOp = { type: 'equal'; a: number; b: number } | { type: 'delete'; a: number } | { type: 'insert'; b: number };

/** Myers' diff: the shortest edit script turning `a` into `b`. */
export function diffSequences<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = Object.is): DiffOp[] {
  // Most drafts share a long start and end; only diff the middle.
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', a: i, b: i });
  ops.push(...myers(a.slice(start, endA), b.slice(start, endB), eq, start, start));
  for (let i = 0; i < a.length - endA; i++) ops.push({ type: 'equal', a: endA + i, b: endB + i });
  return ops;
}

/** Past this many edits, fall back to "replace the middle" to bound memory. */
const MAX_EDITS = 2000;

function myers<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean, offA: number, offB: number): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const replaceAll = (): DiffOp[] => [
    ...a.map((_, i) => ({ type: 'delete' as const, a: offA + i })),
    ...b.map((_, i) => ({ type: 'insert' as const, b: offB + i })),
  ];
  if (!n || !m) return replaceAll();
  const max = Math.min(n + m, MAX_EDITS);
  const size = 2 * max + 3;
  const offset = max + 1;
  const v = new Int32Array(size);
  // trace[d] keeps only the diagonals -d..d that backtracking reads.
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x], b[y])) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return replaceAll();

  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', a: offA + x - 1, b: offB + y - 1 });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ type: 'insert', b: offB + prevY });
      else ops.push({ type: 'delete', a: offA + prevX });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

export interface WordChange {
  type: 'same' | 'added' | 'removed';
  text: string;
}

function tokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Word-level changes between two versions of a line. */
export function diffWords(before: string, after: string): WordChange[] {
  const a = tokens(before);
  const b = tokens(after);
  const out: WordChange[] = [];
  const push = (type: WordChange['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  for (const op of diffSequences(a, b)) {
    if (op.type === 'equal') push('same', a[op.a]);
    else if (op.type === 'delete') push('removed', a[op.a]);
    else push('added', b[op.b]);
  }
  return out;
}

/** How alike two lines are, from 0 (nothing shared) to 1 (identical). */
export function similarity(before: string, after: string): number {
  const a = tokens(before).filter((t) => t.trim());
  const b = tokens(after).filter((t) => t.trim());
  if (!a.length && !b.length) return 1;
  const same = diffSequences(a, b).filter((op) => op.type === 'equal').length;
  return (2 * same) / (a.length + b.length);
}

export type ElementChange =
  | { type: 'same'; before: ScriptElement; after: ScriptElement; beforeIndex: number; afterIndex: number }
  | { type: 'added'; after: ScriptElement; afterIndex: number }
  | { type: 'removed'; before: ScriptElement; beforeIndex: number }
  | { type: 'changed'; before: ScriptElement; after: ScriptElement; beforeIndex: number; afterIndex: number; words: WordChange[] };

export interface Comparison {
  changes: ElementChange[];
  added: number;
  removed: number;
  changed: number;
}

const key = (el: ScriptElement) => `${el.kind}\u0000${plainText(el).trim()}`;

/**
 * Compare two versions of a script element by element. A removed line and an
 * added line of the same type that share most of their words are reported
 * as one changed line, with the word-level edits.
 */
export function compareScripts(before: ScriptElement[], after: ScriptElement[]): Comparison {
  const a = before.filter((el) => plainText(el).trim());
  const b = after.filter((el) => plainText(el).trim());
  const aIndex = before.map((el, i) => (plainText(el).trim() ? i : -1)).filter((i) => i >= 0);
  const bIndex = after.map((el, i) => (plainText(el).trim() ? i : -1)).filter((i) => i >= 0);
  const ak = a.map(key);
  const bk = b.map(key);
  const ops = diffSequences(ak, bk);
  const changes: ElementChange[] = [];
  let dels: number[] = [];
  let ins: number[] = [];

  const flush = () => {
    let j = 0;
    for (const d of dels) {
      const partner = ins.findIndex(
        (i, t) => t >= j && b[i].kind === a[d].kind && similarity(plainText(a[d]), plainText(b[i])) >= 0.4,
      );
      if (partner === -1) {
        changes.push({ type: 'removed', before: a[d], beforeIndex: aIndex[d] });
        continue;
      }
      for (; j < partner; j++) changes.push({ type: 'added', after: b[ins[j]], afterIndex: bIndex[ins[j]] });
      const i = ins[partner];
      changes.push({
        type: 'changed',
        before: a[d],
        after: b[i],
        beforeIndex: aIndex[d],
        afterIndex: bIndex[i],
        words: diffWords(plainText(a[d]), plainText(b[i])),
      });
      j = partner + 1;
    }
    for (; j < ins.length; j++) changes.push({ type: 'added', after: b[ins[j]], afterIndex: bIndex[ins[j]] });
    dels = [];
    ins = [];
  };

  for (const op of ops) {
    if (op.type === 'delete') dels.push(op.a);
    else if (op.type === 'insert') ins.push(op.b);
    else {
      flush();
      changes.push({ type: 'same', before: a[op.a], after: b[op.b], beforeIndex: aIndex[op.a], afterIndex: bIndex[op.b] });
    }
  }
  flush();

  const count = (t: ElementChange['type']) => changes.filter((c) => c.type === t).length;
  return { changes, added: count('added'), removed: count('removed'), changed: count('changed') };
}

/**
 * Elements of `current` that are new or changed since `baseline`, for
 * revision marks (*). Notes are never marked because they never print.
 */
export function revisedIndices(baseline: ScriptElement[], current: ScriptElement[]): Set<number> {
  const out = new Set<number>();
  for (const c of compareScripts(baseline, current).changes) {
    if ((c.type === 'added' || c.type === 'changed') && c.after.kind !== 'note') out.add(c.afterIndex);
  }
  return out;
}
