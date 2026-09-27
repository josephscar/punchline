import { DEFAULT_FORMAT_ID, getFormat } from './formats';
import { rememberCharacters } from './suggestions';
import {
  defaultSettings,
  emptyTitlePage,
  isElementKind,
  newId,
  normalizeRuns,
  REVISION_COLORS,
  textElement,
  type Draft,
  type Project,
  type RevisionColor,
  type Script,
  type ScriptElement,
  type ScriptSettings,
  type TitlePage,
} from './types';

export function createScript(
  options: { formatId?: string; title?: string; blank?: boolean; projectId?: string | null } = {},
): Script {
  const format = getFormat(options.formatId ?? DEFAULT_FORMAT_ID);
  const now = Date.now();
  const titlePage = emptyTitlePage();
  titlePage.title = options.title ?? '';
  return {
    schemaVersion: 2,
    id: newId(),
    projectId: options.projectId ?? null,
    formatId: format.id,
    titlePage,
    settings: defaultSettings(),
    elements: options.blank ? [textElement('scene_heading', '')] : format.template(),
    characterMemory: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createProject(title: string, formatId: string = DEFAULT_FORMAT_ID): Project {
  const now = Date.now();
  return { id: newId(), title: title.trim() || 'Untitled Project', formatId: getFormat(formatId).id, createdAt: now, updatedAt: now };
}

/** Freeze the script's current pages as a named draft. */
export function createDraft(script: Script, options: { name: string; color?: RevisionColor | null; note?: string }): Draft {
  return {
    id: newId(),
    scriptId: script.id,
    name: options.name.trim() || 'Untitled draft',
    color: options.color ?? null,
    note: options.note?.trim() ?? '',
    createdAt: Date.now(),
    titlePage: structuredClone(script.titlePage),
    elements: structuredClone(script.elements),
  };
}

/** A sensible name and colour for the next draft of a script. */
export function suggestDraftName(existing: Pick<Draft, 'color'>[]): { name: string; color: RevisionColor } {
  const n = existing.length + 1;
  const color = REVISION_COLORS[Math.min(existing.length, REVISION_COLORS.length - 1)];
  return { name: n === 1 ? 'First Draft' : `Draft ${n}`, color };
}

export function scriptFromParsed(
  parsed: { titlePage: TitlePage; elements: ScriptElement[] },
  formatId?: string,
  projectId: string | null = null,
): Script {
  const script = createScript({ formatId, projectId });
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

function sanitizeElements(input: unknown): ScriptElement[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e): e is ScriptElement => !!e && typeof e === 'object' && isElementKind((e as ScriptElement).kind))
    .map((e) => ({
      kind: e.kind,
      runs: normalizeRuns(
        (Array.isArray(e.runs) ? e.runs : [])
          .filter((r) => r && typeof r.text === 'string')
          .map((r) => ({ text: r.text, bold: !!r.bold, italic: !!r.italic, underline: !!r.underline })),
      ),
    }));
}

function sanitizeTitlePage(input: unknown): TitlePage {
  const tp = { ...emptyTitlePage(), ...(input && typeof input === 'object' ? input : {}) } as TitlePage;
  for (const key of Object.keys(emptyTitlePage()) as (keyof TitlePage)[]) tp[key] = String(tp[key] ?? '');
  return tp;
}

function sanitizeSettings(input: unknown): ScriptSettings {
  const out = defaultSettings();
  if (!input || typeof input !== 'object') return out;
  const raw = input as Record<string, unknown>;
  for (const key of ['sceneNumbers', 'autoContd', 'includeTitlePage'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  if (typeof raw.revisionBaseline === 'string') out.revisionBaseline = raw.revisionBaseline;
  return out;
}

/**
 * Validate and upgrade anything that claims to be a script (from storage or
 * an imported .punchline file). Version 1 scripts gain `projectId: null`.
 * Unknown fields are dropped.
 */
export function sanitizeScript(input: unknown): Script {
  if (!input || typeof input !== 'object') throw new Error('Not a script file.');
  const raw = input as Partial<Script> & Record<string, unknown>;
  if (!Array.isArray(raw.elements)) throw new Error('Script has no elements.');
  const base = createScript({ formatId: typeof raw.formatId === 'string' ? raw.formatId : undefined });
  const elements = sanitizeElements(raw.elements);
  const memory: Record<string, number> = {};
  if (raw.characterMemory && typeof raw.characterMemory === 'object') {
    for (const [k, v] of Object.entries(raw.characterMemory)) if (typeof v === 'number') memory[k] = v;
  }
  return {
    ...base,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    projectId: typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null,
    titlePage: sanitizeTitlePage(raw.titlePage),
    settings: sanitizeSettings(raw.settings),
    elements: elements.length ? elements : base.elements,
    characterMemory: memory,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
  };
}

export function sanitizeDraft(input: unknown): Draft {
  if (!input || typeof input !== 'object') throw new Error('Not a draft.');
  const raw = input as Partial<Draft>;
  if (typeof raw.id !== 'string' || typeof raw.scriptId !== 'string') throw new Error('Draft is missing its ids.');
  return {
    id: raw.id,
    scriptId: raw.scriptId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled draft',
    color: REVISION_COLORS.includes(raw.color as RevisionColor) ? (raw.color as RevisionColor) : null,
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    titlePage: sanitizeTitlePage(raw.titlePage),
    elements: sanitizeElements(raw.elements),
  };
}

export function sanitizeProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new Error('Not a project.');
  const raw = input as Partial<Project>;
  if (typeof raw.id !== 'string') throw new Error('Project is missing its id.');
  const now = Date.now();
  return {
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled Project',
    formatId: getFormat(typeof raw.formatId === 'string' ? raw.formatId : undefined).id,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}
