import { DEFAULT_FORMAT_ID, getFormat } from './formats';
import { rememberCharacters } from './suggestions';
import {
  defaultSettings,
  emptyTitlePage,
  isElementKind,
  newId,
  normalizeRuns,
  textElement,
  type Script,
  type ScriptElement,
  type TitlePage,
} from './types';

export function createScript(options: { formatId?: string; title?: string; blank?: boolean } = {}): Script {
  const format = getFormat(options.formatId ?? DEFAULT_FORMAT_ID);
  const now = Date.now();
  const titlePage = emptyTitlePage();
  titlePage.title = options.title ?? '';
  return {
    schemaVersion: 1,
    id: newId(),
    formatId: format.id,
    titlePage,
    settings: defaultSettings(),
    elements: options.blank ? [textElement('scene_heading', '')] : format.template(),
    characterMemory: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function scriptFromParsed(parsed: { titlePage: TitlePage; elements: ScriptElement[] }, formatId?: string): Script {
  const script = createScript({ formatId });
  script.titlePage = parsed.titlePage;
  script.elements = parsed.elements.length ? parsed.elements : [textElement('scene_heading', '')];
  script.characterMemory = rememberCharacters({}, script.elements);
  return script;
}

export function displayTitle(script: Pick<Script, 'titlePage'>): string {
  const { title, episode } = script.titlePage;
  if (title && episode) return `${title} — "${episode}"`;
  return title || (episode ? `"${episode}"` : 'Untitled Script');
}

/**
 * Validate and upgrade anything that claims to be a script (from storage or
 * an imported .punchline file). Unknown fields are dropped.
 */
export function sanitizeScript(input: unknown): Script {
  if (!input || typeof input !== 'object') throw new Error('Not a script file.');
  const raw = input as Partial<Script> & Record<string, unknown>;
  if (!Array.isArray(raw.elements)) throw new Error('Script has no elements.');
  const base = createScript({ formatId: typeof raw.formatId === 'string' ? raw.formatId : undefined });
  const elements: ScriptElement[] = raw.elements
    .filter((e): e is ScriptElement => !!e && typeof e === 'object' && isElementKind((e as ScriptElement).kind))
    .map((e) => ({
      kind: e.kind,
      runs: normalizeRuns(
        (Array.isArray(e.runs) ? e.runs : [])
          .filter((r) => r && typeof r.text === 'string')
          .map((r) => ({ text: r.text, bold: !!r.bold, italic: !!r.italic, underline: !!r.underline })),
      ),
    }));
  const tp = { ...emptyTitlePage(), ...(typeof raw.titlePage === 'object' ? raw.titlePage : {}) };
  for (const key of Object.keys(tp) as (keyof TitlePage)[]) tp[key] = String(tp[key] ?? '');
  const memory: Record<string, number> = {};
  if (raw.characterMemory && typeof raw.characterMemory === 'object') {
    for (const [k, v] of Object.entries(raw.characterMemory)) if (typeof v === 'number') memory[k] = v;
  }
  return {
    ...base,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    titlePage: tp,
    settings: { ...base.settings, ...(typeof raw.settings === 'object' ? raw.settings : {}) },
    elements: elements.length ? elements : base.elements,
    characterMemory: memory,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
  };
}

/** The app's own file format: the script object plus a small envelope. */
export function serializeNative(script: Script): string {
  return JSON.stringify({ app: 'punchline', kind: 'script', version: 1, script }, null, 2);
}

export function parseNative(text: string): Script {
  const data = JSON.parse(text);
  const script = data && data.app === 'punchline' ? data.script : data;
  return sanitizeScript(script);
}
