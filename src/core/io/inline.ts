import { normalizeRuns, type TextRun } from '../types';

/**
 * Fountain-style inline emphasis: ***bold italic***, **bold**, *italic*,
 * _underline_, with backslash escapes. Unmatched markers stay literal.
 */
export function parseEmphasis(input: string): TextRun[] {
  const runs: TextRun[] = [];
  const state = { bold: false, italic: false, underline: false };
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const run: TextRun = { text: buf };
    if (state.bold) run.bold = true;
    if (state.italic) run.italic = true;
    if (state.underline) run.underline = true;
    runs.push(run);
    buf = '';
  };
  const hasCloser = (marker: string, from: number) => {
    for (let j = from; j <= input.length - marker.length; j++) {
      if (input[j] === '\\') {
        j++;
        continue;
      }
      if (input.startsWith(marker, j)) return true;
    }
    return false;
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\\' && i + 1 < input.length && /[*_\\]/.test(input[i + 1])) {
      buf += input[i + 1];
      i++;
      continue;
    }
    if (ch === '*' || ch === '_') {
      let marker = ch;
      if (ch === '*') {
        if (input.startsWith('***', i)) marker = '***';
        else if (input.startsWith('**', i)) marker = '**';
      }
      const toggles =
        marker === '***' ? (['bold', 'italic'] as const) : marker === '**' ? (['bold'] as const) : marker === '*' ? (['italic'] as const) : (['underline'] as const);
      const opening = !state[toggles[0]];
      if (!opening || hasCloser(marker, i + marker.length)) {
        flush();
        for (const t of toggles) state[t] = !state[t];
        i += marker.length - 1;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return normalizeRuns(runs);
}

function escape(text: string): string {
  return text.replace(/([\\*_])/g, '\\$1');
}

/** Inverse of parseEmphasis. */
export function serializeEmphasis(runs: TextRun[]): string {
  return normalizeRuns(runs)
    .map((run) => {
      const text = escape(run.text);
      // Keep surrounding whitespace outside the markers.
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      if (!m[2]) return text;
      let core = m[2];
      if (run.underline) core = `_${core}_`;
      if (run.bold && run.italic) core = `***${core}***`;
      else if (run.bold) core = `**${core}**`;
      else if (run.italic) core = `*${core}*`;
      return m[1] + core + m[3];
    })
    .join('');
}
