import boldItalicUrl from '../assets/fonts/CourierPrime-BoldItalic.ttf?url';
import boldUrl from '../assets/fonts/CourierPrime-Bold.ttf?url';
import italicUrl from '../assets/fonts/CourierPrime-Italic.ttf?url';
import regularUrl from '../assets/fonts/CourierPrime-Regular.ttf?url';
import { parseFdx } from '../core/io/fdx';
import { parseFountain } from '../core/io/fountain';
import type { PdfFonts } from '../core/io/pdf';
import { parseBackup, withFreshIds, type Backup } from '../core/backup';
import { scriptFromParsed } from '../core/script';

export const IMPORT_ACCEPT = '.fountain,.spmd,.txt,.fdx,.punchline,.json';

export function safeFilename(name: string): string {
  return (
    name
      .replace(/["“”]/g, '')
      .replace(/[^\p{L}\p{N} _.-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Untitled Script'
  );
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Read a Fountain, Final Draft or Punchline file. Everything imported gets
 * fresh ids, so importing never overwrites scripts already in the library.
 * Fountain and Final Draft files become a script in `projectId`; a
 * Punchline project backup becomes a new project.
 */
export async function importFile(file: File, projectId: string | null, formatId?: string): Promise<Backup> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
  if (name.endsWith('.punchline') || name.endsWith('.json') || text.trimStart().startsWith('{')) {
    return withFreshIds(parseBackup(text), projectId);
  }
  const parsed = name.endsWith('.fdx') || text.trimStart().startsWith('<?xml') ? parseFdx(text) : parseFountain(text);
  const script = scriptFromParsed(parsed, formatId, projectId);
  if (!script.titlePage.title) script.titlePage.title = fallbackTitle;
  return { kind: 'script', script, drafts: [] };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

let fontCache: Promise<PdfFonts | undefined> | null = null;

/** Courier Prime for PDFs. Falls back to the PDF's built-in Courier if loading fails. */
export function loadPdfFonts(): Promise<PdfFonts | undefined> {
  fontCache ??= (async () => {
    try {
      const load = async (url: string) => toBase64(await (await fetch(url)).arrayBuffer());
      const [regular, bold, italic, boldItalic] = await Promise.all([regularUrl, boldUrl, italicUrl, boldItalicUrl].map(load));
      return { regular, bold, italic, boldItalic };
    } catch {
      return undefined;
    }
  })();
  return fontCache;
}
