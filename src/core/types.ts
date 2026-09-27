/**
 * Core, framework-agnostic data model for a script.
 *
 * Everything in `src/core` works on these plain objects so the same logic
 * powers the editor, pagination, PDF output and file import/export. A new
 * script format (v2: multi-cam, feature, etc.) plugs in by describing how
 * these elements are laid out — the model itself stays the same.
 */

export const ELEMENT_KINDS = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'act_start',
  'act_end',
  'note',
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];

export function isElementKind(value: unknown): value is ElementKind {
  return typeof value === 'string' && (ELEMENT_KINDS as readonly string[]).includes(value);
}

/** A run of text sharing the same inline styling. */
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** One paragraph of the script: a scene heading, a line of dialogue, a note… */
export interface ScriptElement {
  kind: ElementKind;
  runs: TextRun[];
}

export interface TitlePage {
  /** Series / show title, e.g. "THE OFFICE". */
  title: string;
  /** Episode title, e.g. "Pilot". Printed in quotes under the show title. */
  episode: string;
  /** Credit line, e.g. "Written by". */
  credit: string;
  /** Writer names, one per line. */
  authors: string;
  /** Optional "Based on…" / story-by line. */
  source: string;
  /** Draft label and date, e.g. "First Draft — 9/27/2026". */
  draft: string;
  /** Contact block, one entry per line. */
  contact: string;
}

export interface ScriptSettings {
  /** Print scene numbers beside scene headings. */
  sceneNumbers: boolean;
  /** Add (CONT'D) when a character keeps talking after action in the same scene. */
  autoContd: boolean;
  /** Print a title page. */
  includeTitlePage: boolean;
}

export interface Script {
  /** File-format version of this object — bump when the shape changes. */
  schemaVersion: 1;
  id: string;
  /** Script format id, e.g. "single-cam-sitcom". */
  formatId: string;
  titlePage: TitlePage;
  settings: ScriptSettings;
  elements: ScriptElement[];
  /**
   * Character names this script has "remembered", with how often each was
   * used. Names stay here even after every line is deleted, so they keep
   * being suggested (the writer can forget them from the Characters panel).
   */
  characterMemory: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export function plainText(el: { runs: TextRun[] }): string {
  return el.runs.map((r) => r.text).join('');
}

export function textElement(kind: ElementKind, text: string): ScriptElement {
  return { kind, runs: text ? [{ text }] : [] };
}

export function emptyTitlePage(): TitlePage {
  return { title: '', episode: '', credit: 'Written by', authors: '', source: '', draft: '', contact: '' };
}

export function defaultSettings(): ScriptSettings {
  return { sceneNumbers: false, autoContd: true, includeTitlePage: true };
}

/** Collapse adjacent runs with identical styling and drop empty runs. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!run.bold && !!prev.italic === !!run.italic && !!prev.underline === !!run.underline) {
      prev.text += run.text;
    } else {
      const next: TextRun = { text: run.text };
      if (run.bold) next.bold = true;
      if (run.italic) next.italic = true;
      if (run.underline) next.underline = true;
      out.push(next);
    }
  }
  return out;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
