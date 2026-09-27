import { describe, expect, it } from 'vitest';
import { wrapText } from './wrap';

const lines = (text: string, width: number, rest?: number) => wrapText(text, width, rest).map(([s, e]) => text.slice(s, e));

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(lines('Hello there.', 35)).toEqual(['Hello there.']);
  });

  it('breaks at the last space that fits', () => {
    expect(lines('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('lets a space right at the limit hang off the line', () => {
    expect(lines('abcde fgh', 5)).toEqual(['abcde', 'fgh']);
  });

  it('breaks after hyphens between letters', () => {
    expect(lines('a well-known fact', 8)).toEqual(['a well-', 'known', 'fact']);
  });

  it('hard-breaks words longer than the line', () => {
    expect(lines('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('honours explicit newlines and empty lines', () => {
    expect(lines('first\n\nthird', 20)).toEqual(['first', '', 'third']);
  });

  it('supports a narrower width after the first line (hanging indent)', () => {
    expect(lines('aaa bbb ccc', 7, 3)).toEqual(['aaa bbb', 'ccc']);
    expect(lines('aaaa bbbb cccc', 9, 4)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('returns one empty line for empty text', () => {
    expect(wrapText('', 10)).toEqual([[0, 0]]);
  });
});
