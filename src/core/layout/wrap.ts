/**
 * Word-wrap for monospaced text. Mirrors what the browser does with
 * `white-space: pre-wrap` in a box `width` characters wide, so page breaks
 * computed here line up with what the editor shows.
 *
 * Returns [start, end) character ranges; trailing spaces are excluded from
 * `end`. A "\n" always ends a line. `restWidth` applies to every line after
 * the first (for hanging indents).
 */
export function wrapText(text: string, width: number, restWidth = width): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  let paragraphStart = 0;
  const widthFor = (line: number) => Math.max(1, line === 0 ? width : restWidth);
  while (true) {
    const nl = text.indexOf('\n', paragraphStart);
    const paragraphEnd = nl === -1 ? text.length : nl;
    wrapParagraph(text, paragraphStart, paragraphEnd, widthFor, lines);
    if (nl === -1) break;
    paragraphStart = nl + 1;
  }
  return lines;
}

function trimEnd(text: string, start: number, end: number): number {
  while (end > start && text[end - 1] === ' ') end--;
  return end;
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}

function wrapParagraph(
  text: string,
  start: number,
  end: number,
  widthFor: (line: number) => number,
  out: Array<[number, number]>,
) {
  if (start === end) {
    out.push([start, start]);
    return;
  }
  let pos = start;
  let first = true;
  while (pos < end) {
    if (!first) {
      // Spaces at a soft break hang off the previous line.
      while (pos < end && text[pos] === ' ') pos++;
      if (pos >= end) break;
    }
    first = false;
    const width = widthFor(out.length);
    const visibleEnd = trimEnd(text, pos, end);
    if (visibleEnd - pos <= width) {
      out.push([pos, visibleEnd]);
      break;
    }
    const limit = pos + width;
    let breakAt = -1;
    for (let j = limit; j > pos; j--) {
      if (text[j] === ' ' && text[j - 1] !== ' ') {
        breakAt = j;
        break;
      }
      if (text[j - 1] === '-' && isWordChar(text[j - 2]) && isWordChar(text[j]) && j <= limit) {
        breakAt = j;
        break;
      }
    }
    if (breakAt === -1) {
      // A word longer than the line: break it hard.
      breakAt = limit;
    }
    out.push([pos, trimEnd(text, pos, breakAt)]);
    pos = breakAt;
  }
}
