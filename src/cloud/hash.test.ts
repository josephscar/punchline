import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFountain } from '../core/io/fountain';
import { createDraft, createScript, sanitizeDraft, sanitizeScript, scriptFromParsed } from '../core/script';
import { createSampleScript } from '../core/sample';
import type { Script } from '../core/types';
import { hashDraft, hashScript } from './hash';

/** What another device reads back after this script is uploaded. */
const roundTrip = (s: Script) => sanitizeScript(JSON.parse(JSON.stringify(s)));

describe('content hashes', () => {
  const fountain = readFileSync(new URL('../core/__fixtures__/sample.fountain', import.meta.url), 'utf8');
  const scripts: [string, Script][] = [
    ['sample', createSampleScript()],
    ['template', createScript({ formatId: 'feature-screenplay' })],
    ['blank', createScript({ blank: true })],
    ['imported', scriptFromParsed(parseFountain(fountain), 'single-cam-sitcom', null)],
    [
      'untidy',
      {
        ...createScript({ blank: true }),
        elements: [
          { kind: 'action', runs: [{ text: '' }, { text: 'Dana ', bold: false }, { text: 'waits', italic: undefined }] },
          { kind: 'character', runs: [{ text: 'DANA', bold: true }, { text: '', underline: true }] },
        ],
      },
    ],
  ];

  it.each(scripts)('a %s script hashes the same after a trip through the cloud', (_name, script) => {
    expect(hashScript(roundTrip(script))).toBe(hashScript(script));
    expect(hashScript(roundTrip(roundTrip(script)))).toBe(hashScript(script));
  });

  it('ignores timestamps and the project, but not the words', () => {
    const s = createSampleScript();
    expect(hashScript({ ...s, updatedAt: 1, createdAt: 2, projectId: 'p' })).toBe(hashScript(s));
    const edited = structuredClone(s);
    edited.elements[1].runs = [{ text: 'Something else.' }];
    expect(hashScript(edited)).not.toBe(hashScript(s));
  });

  it('hashes drafts consistently too', () => {
    const draft = createDraft(createSampleScript(), { name: 'First Draft' });
    expect(hashDraft(sanitizeDraft(JSON.parse(JSON.stringify(draft))))).toBe(hashDraft(draft));
  });
});
