import { jsPDF } from 'jspdf';
import type { ScriptFormat } from '../formats';
import { layoutScript, type LayoutLine } from '../layout/paginate';
import type { Script, TextRun } from '../types';

/**
 * Renders a script to a print-ready PDF. Everything is placed on the same
 * character grid the paginator uses: 12pt type, 10 characters per inch,
 * 6 lines per inch.
 */

export interface PdfFonts {
  /** Base64 TTF data for Courier Prime (or any monospaced font). */
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

const PT_PER_IN = 72;
const CHAR_PT = 7.2;
const LINE_PT = 12;
const BASELINE_PT = 9.5;

function registerFonts(doc: jsPDF, fonts?: PdfFonts): string {
  if (!fonts) return 'courier';
  const files: [keyof PdfFonts, string][] = [
    ['regular', 'normal'],
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['boldItalic', 'bolditalic'],
  ];
  for (const [key, style] of files) {
    const file = `CourierPrime-${key}.ttf`;
    doc.addFileToVFS(file, fonts[key]);
    doc.addFont(file, 'CourierPrime', style);
  }
  return 'CourierPrime';
}

function styleName(run: TextRun): string {
  if (run.bold && run.italic) return 'bolditalic';
  if (run.bold) return 'bold';
  if (run.italic) return 'italic';
  return 'normal';
}

export interface PdfOptions {
  fonts?: PdfFonts;
  /** Elements to mark with a revision asterisk in the right margin. */
  revised?: Set<number>;
}

export function renderScriptPdf(script: Script, format: ScriptFormat, options: PdfOptions = {}): jsPDF {
  const { fonts } = options;
  const { page } = format;
  const doc = new jsPDF({ unit: 'pt', format: [page.widthIn * PT_PER_IN, page.heightIn * PT_PER_IN] });
  const family = registerFonts(doc, fonts);
  doc.setFontSize(12);
  doc.setLineWidth(0.6);
  const title = script.titlePage.title || 'Untitled Script';
  doc.setProperties({
    title: script.titlePage.episode ? `${title} - "${script.titlePage.episode}"` : title,
    author: script.titlePage.authors.replace(/\n/g, ', '),
    creator: 'Punchline',
  });

  const left = page.marginLeftIn * PT_PER_IN;
  const top = page.marginTopIn * PT_PER_IN;
  const right = (page.widthIn - page.marginRightIn) * PT_PER_IN;

  const drawText = (runs: TextRun[], x: number, baseline: number) => {
    let cx = x;
    for (const run of runs) {
      if (!run.text) continue;
      doc.setFont(family, styleName(run));
      doc.text(run.text, cx, baseline);
      const width = run.text.length * CHAR_PT;
      if (run.underline) {
        const text = run.text;
        const lead = text.length - text.trimStart().length;
        const trail = text.length - text.trimEnd().length;
        doc.line(cx + lead * CHAR_PT, baseline + 1.8, cx + width - trail * CHAR_PT, baseline + 1.8);
      }
      cx += width;
    }
  };

  const drawCentered = (text: string, y: number, bold = false) => {
    doc.setFont(family, bold ? 'bold' : 'normal');
    const width = text.length * CHAR_PT;
    doc.text(text, (page.widthIn * PT_PER_IN - width) / 2, y);
  };

  let firstPage = true;
  if (script.settings.includeTitlePage && (script.titlePage.title || script.titlePage.episode)) {
    firstPage = false;
    const tp = script.titlePage;
    let y = 3.5 * PT_PER_IN;
    if (tp.title) {
      for (const line of tp.title.toUpperCase().split('\n')) {
        drawCentered(line, y);
        y += LINE_PT;
      }
    }
    if (tp.episode) {
      y += LINE_PT;
      drawCentered(`"${tp.episode}"`, y);
      y += LINE_PT;
    }
    if (tp.authors) {
      y += LINE_PT * 3;
      drawCentered(tp.credit || 'Written by', y);
      y += LINE_PT * 2;
      for (const a of tp.authors.split('\n')) {
        drawCentered(a, y);
        y += LINE_PT;
      }
    }
    if (tp.source) {
      y += LINE_PT * 2;
      for (const s of tp.source.split('\n')) {
        drawCentered(s, y);
        y += LINE_PT;
      }
    }
    doc.setFont(family, 'normal');
    const bottom = (page.heightIn - 1) * PT_PER_IN;
    const contact = tp.contact.split('\n').filter(Boolean);
    contact.forEach((c, i) => doc.text(c, left, bottom - (contact.length - 1 - i) * LINE_PT));
    const draft = tp.draft.split('\n').filter(Boolean);
    draft.forEach((d, i) => doc.text(d, right - d.length * CHAR_PT, bottom - (draft.length - 1 - i) * LINE_PT));
  }

  const layout = layoutScript(script, format, { revised: options.revised });
  for (const p of layout.pages) {
    if (!firstPage) doc.addPage();
    firstPage = false;
    if (p.number > 1) {
      doc.setFont(family, 'normal');
      const label = `${p.number}.`;
      doc.text(label, right - label.length * CHAR_PT, page.pageNumberTopIn * PT_PER_IN + BASELINE_PT);
    }
    for (const line of p.lines) drawLine(line);
  }

  function drawLine(line: LayoutLine) {
    const baseline = top + line.y * LINE_PT + BASELINE_PT;
    drawText(line.runs, left + line.x * CHAR_PT, baseline);
    if (line.revised) {
      doc.setFont(family, 'bold');
      doc.text('*', right + 6 * CHAR_PT, baseline);
    }
    if (line.sceneNumber) {
      doc.setFont(family, 'normal');
      const n = String(line.sceneNumber);
      doc.text(n, left - (n.length + 4) * CHAR_PT, baseline);
      doc.text(n, right + 3 * CHAR_PT, baseline);
    }
  }

  return doc;
}
