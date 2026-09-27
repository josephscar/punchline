import { describe, expect, it } from 'vitest';
import { compareScripts, diffSequences, diffWords, revisedIndices, similarity, type DiffOp } from './diff';
import { textElement as el } from './types';

function apply<T>(a: T[], b: T[], ops: DiffOp[]): T[] {
  const out: T[] = [];
  for (const op of ops) {
    if (op.type === 'equal') out.push(a[op.a]);
    if (op.type === 'insert') out.push(b[op.b]);
  }
  return out;
}

describe('diffSequences', () => {
  it('produces a minimal edit script that rebuilds the target', () => {
    const a = [...'ABCABBA'];
    const b = [...'CBABAC'];
    const ops = diffSequences(a, b);
    expect(apply(a, b, ops)).toEqual(b);
    expect(ops.filter((o) => o.type !== 'equal')).toHaveLength(5); // the classic Myers example: D = 5
  });

  it('handles empty sides and identical input', () => {
    expect(diffSequences([], ['x'])).toEqual([{ type: 'insert', b: 0 }]);
    expect(diffSequences(['x'], [])).toEqual([{ type: 'delete', a: 0 }]);
    expect(diffSequences(['a', 'b'], ['a', 'b']).every((o) => o.type === 'equal')).toBe(true);
  });

  it('agrees with random edits', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 50; round++) {
      const a = Array.from({ length: Math.floor(rand() * 30) }, () => 'abcde'[Math.floor(rand() * 5)]);
      const b = a.filter(() => rand() > 0.2).map((x) => (rand() > 0.9 ? 'z' : x));
      expect(apply(a, b, diffSequences(a, b))).toEqual(b);
    }
  });
});

describe('word changes', () => {
  it('marks the words that changed', () => {
    expect(diffWords('It was a long lunch.', 'It was a very long lunch!')).toEqual([
      { type: 'same', text: 'It was a ' },
      { type: 'added', text: 'very ' },
      { type: 'same', text: 'long lunch' },
      { type: 'removed', text: '.' },
      { type: 'added', text: '!' },
    ]);
    expect(similarity('It was a long lunch.', 'It was a very long lunch!')).toBeGreaterThan(0.7);
    expect(similarity('Hello there.', 'Completely different words')).toBe(0);
  });
});

describe('compareScripts', () => {
  const before = [
    el('scene_heading', 'INT. OFFICE - DAY'),
    el('action', 'Dana tapes a banner.'),
    el('character', 'GARY'),
    el('dialogue', 'Why is there a banner?'),
    el('character', 'DANA'),
    el('dialogue', 'Because you are back!'),
  ];
  const after = [
    el('scene_heading', 'INT. OFFICE - DAY'),
    el('action', 'Dana tapes a huge banner.'),
    el('character', 'GARY'),
    el('dialogue', 'Why is there a banner?'),
    el('note', 'Punch this up'),
    el('character', 'MARCUS'),
    el('dialogue', 'Is that cake?'),
  ];

  it('reports added, removed and changed elements in script order', () => {
    const cmp = compareScripts(before, after);
    expect(cmp.changes.map((c) => c.type)).toEqual(['same', 'changed', 'same', 'same', 'removed', 'removed', 'added', 'added', 'added']);
    expect({ added: cmp.added, removed: cmp.removed, changed: cmp.changed }).toEqual({ added: 3, removed: 2, changed: 1 });
    const changed = cmp.changes[1];
    expect(changed.type === 'changed' && changed.words.find((w) => w.type === 'added')?.text).toBe('huge ');
  });

  it('marks revised lines of the new version, but never notes', () => {
    expect(Array.from(revisedIndices(before, after))).toEqual([1, 5, 6]);
    expect(revisedIndices(after, after).size).toBe(0);
  });

  it('ignores empty elements', () => {
    expect(compareScripts([el('action', '')], [el('action', ''), el('action', '')]).changes).toEqual([]);
  });
});
