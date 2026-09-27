import { describe, expect, it } from 'vitest';
import { createScript, displayTitle, parseNative, sanitizeScript, serializeNative } from './script';

describe('scripts', () => {
  it('starts a single-cam script with a cold open, two acts and a tag', () => {
    const script = createScript();
    const acts = script.elements.filter((e) => e.kind === 'act_start').map((e) => e.runs[0].text);
    expect(acts).toEqual(['COLD OPEN', 'ACT ONE', 'ACT TWO', 'TAG']);
    expect(script.elements[script.elements.length - 1].runs[0].text).toBe('END OF SHOW');
  });

  it('round-trips through the native file format', () => {
    const script = createScript({ title: 'PAPER TRAIL' });
    script.characterMemory = { DANA: 4 };
    expect(parseNative(serializeNative(script))).toEqual(script);
  });

  it('cleans up malformed data', () => {
    const s = sanitizeScript({
      elements: [{ kind: 'action', runs: [{ text: 'ok', bold: 1 }] }, { kind: 'bogus', runs: [] }, null],
      titlePage: { title: 5 },
      characterMemory: { A: 1, B: 'x' },
    });
    expect(s.elements).toEqual([{ kind: 'action', runs: [{ text: 'ok', bold: true }] }]);
    expect(s.titlePage.title).toBe('5');
    expect(s.characterMemory).toEqual({ A: 1 });
    expect(() => sanitizeScript({})).toThrow();
  });

  it('builds a display title', () => {
    const s = createScript({ title: 'PAPER TRAIL' });
    expect(displayTitle(s)).toBe('PAPER TRAIL');
    s.titlePage.episode = 'Pilot';
    expect(displayTitle(s)).toBe('PAPER TRAIL — "Pilot"');
  });
});
