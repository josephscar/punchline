import { describe, expect, it } from 'vitest';
import { layoutScript } from '../layout/paginate';
import { getSuggestions } from '../suggestions';
import { defaultSettings, plainText, textElement as el } from '../types';
import { FORMATS, getFormat } from './index';

const drama = getFormat('one-hour-drama');
const feature = getFormat('feature-screenplay');

describe('formats', () => {
  it('registers single-cam, one-hour drama and feature (multi-cam comes later)', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['single-cam-sitcom', 'one-hour-drama', 'feature-screenplay']);
    expect(getFormat('nope').id).toBe('single-cam-sitcom');
  });

  it('gives every format a complete, consistent definition', () => {
    for (const f of FORMATS) {
      expect(f.flow.tabCycle).toEqual(f.elementOrder);
      for (const kind of f.elementOrder) expect(f.elements[kind].label).toBeTruthy();
      const shortcuts = f.elementOrder.map((k) => f.elements[k].shortcut);
      expect(new Set(shortcuts).size).toBe(shortcuts.length);
      expect(f.template().length).toBeGreaterThan(0);
    }
  });

  it('starts a drama with a teaser and five acts, each on its own page', () => {
    const acts = drama.template().filter((e) => e.kind === 'act_start').map(plainText);
    expect(acts).toEqual(['TEASER', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE']);
    expect(plainText(drama.template().at(-1)!)).toBe('END OF EPISODE');
    const withText = drama.template().map((e) => (e.kind === 'scene_heading' ? el('scene_heading', 'INT. OR - DAY') : e));
    expect(layoutScript({ elements: withText, settings: defaultSettings() }, drama).pages).toHaveLength(6);
  });

  it('starts a feature with FADE IN: at the left and FADE OUT. on the right, without acts', () => {
    const t = feature.template();
    expect(t.map((e) => [e.kind, plainText(e)])).toEqual([
      ['action', 'FADE IN:'],
      ['scene_heading', ''],
      ['action', ''],
      ['transition', 'FADE OUT.'],
    ]);
    expect(feature.elementOrder).not.toContain('act_start');
    expect(feature.episodic).toBe(false);
  });

  it('suggests the next act in each format’s own order', () => {
    const next = (format: typeof drama, acts: string[]) => {
      const elements = [...acts.map((a) => el('act_start', a)), el('act_start', '')];
      return getSuggestions({ kind: 'act_start', before: '', after: '', index: acts.length, elements, format, memory: {} })[0].label;
    };
    expect(next(drama, [])).toBe('TEASER');
    expect(next(drama, ['TEASER'])).toBe('ACT ONE');
    expect(next(drama, ['TEASER', 'ACT ONE', 'ACT TWO'])).toBe('ACT THREE');
    const sitcom = getFormat('single-cam-sitcom');
    expect(next(sitcom, [])).toBe('COLD OPEN');
    expect(next(sitcom, ['COLD OPEN'])).toBe('ACT ONE');
  });

  it('ends a drama act with END OF EPISODE on offer', () => {
    const elements = [el('act_start', 'ACT FIVE'), el('act_end', '')];
    const labels = getSuggestions({ kind: 'act_end', before: '', after: '', index: 1, elements, format: drama, memory: {} }).map((s) => s.label);
    expect(labels.slice(0, 2)).toEqual(['END OF ACT FIVE', 'END OF EPISODE']);
  });
});
