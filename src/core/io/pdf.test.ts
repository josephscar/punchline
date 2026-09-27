import { describe, expect, it } from 'vitest';
import sample from '../__fixtures__/sample.fountain?raw';
import { singleCamSitcom as format } from '../formats/singleCamSitcom';
import { layoutScript } from '../layout/paginate';
import { scriptFromParsed } from '../script';
import { parseFountain } from './fountain';
import { renderScriptPdf } from './pdf';

describe('renderScriptPdf', () => {
  it('renders a title page plus one page per laid-out page', () => {
    const script = scriptFromParsed(parseFountain(sample));
    const doc = renderScriptPdf(script, format);
    const pages = layoutScript(script, format).pages.length;
    expect(pages).toBe(2); // cold open, act one
    expect(doc.getNumberOfPages()).toBe(pages + 1);
    const pdf = doc.output();
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('COLD OPEN');
    expect(pdf).not.toContain('Punch up this runner');
  });

  it('prints revision marks beside changed lines', () => {
    const script = scriptFromParsed(parseFountain(sample));
    script.settings.includeTitlePage = false;
    const plain = renderScriptPdf(script, format).output();
    const marked = renderScriptPdf(script, format, { revised: new Set([2, 3]) }).output();
    const stars = (pdf: string) => (pdf.match(/\(\*\) Tj/g) ?? []).length;
    expect(stars(plain)).toBe(0);
    expect(stars(marked)).toBeGreaterThanOrEqual(2);
  });

  it('skips the title page when turned off', () => {
    const script = scriptFromParsed(parseFountain(sample));
    script.settings.includeTitlePage = false;
    expect(renderScriptPdf(script, format).getNumberOfPages()).toBe(2);
  });
});
