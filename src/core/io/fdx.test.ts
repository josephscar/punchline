// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import sample from '../__fixtures__/sample.fountain?raw';
import { singleCamSitcom as format } from '../formats/singleCamSitcom';
import { plainText } from '../types';
import { parseFdx, serializeFdx } from './fdx';
import { parseFountain } from './fountain';

describe('Final Draft .fdx', () => {
  const parsed = parseFountain(sample);
  const xml = serializeFdx(parsed, format);

  it('writes Final Draft paragraph types, including TV act elements', () => {
    expect(xml).toContain('<Paragraph Type="New Act" StartsNewPage="Yes"><Text Style="Bold+Underline">COLD OPEN</Text></Paragraph>');
    expect(xml).toContain('<Paragraph Type="Parenthetical"><Text>(beaming)</Text></Paragraph>');
    expect(xml).toContain('<Text>It was a </Text><Text Style="Italic">long</Text>');
    expect(xml).not.toContain('Punch up this runner');
  });

  it('round-trips everything except notes', () => {
    const back = parseFdx(xml);
    const withoutNotes = parsed.elements.filter((e) => e.kind !== 'note');
    expect(back.elements.map((e) => `${e.kind}: ${plainText(e)}`)).toEqual(withoutNotes.map((e) => `${e.kind}: ${plainText(e)}`));
    expect(back.titlePage).toMatchObject({ title: 'PAPER TRAIL', episode: 'Pilot', credit: 'Written by', authors: 'Sam Rivera' });
  });

  it('rejects files that are not Final Draft documents', () => {
    expect(() => parseFdx('<html></html>')).toThrow(/Final Draft/);
  });
});
