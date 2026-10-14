import { characterName, currentActName, parseSceneHeading } from './analysis';
import type { ScriptFormat } from './formats';
import { plainText, type ElementKind, type ScriptElement } from './types';

/**
 * Autocomplete ("SmartType") engine.
 *
 * Given the element the cursor is in and the text typed so far, returns
 * ranked suggestions. Character suggestions are the characters who speak in
 * this script and in the other scripts of its project, as they are now, and
 * are ranked by who is most likely to speak next in the current scene.
 */

export interface Suggestion {
  /** Text shown in the list. */
  label: string;
  /** Replacement for the element's text from `from` to the cursor. */
  insert: string;
  /** Character offset (within the element's text) where replacement starts. */
  from: number;
  /** Small hint on the right of the item, e.g. "next speaker". */
  detail?: string;
  /** Show the list again right after accepting (e.g. location → time of day). */
  chain?: boolean;
}

export interface SuggestionContext {
  kind: ElementKind;
  /** Element text before the cursor. */
  before: string;
  /** Element text after the cursor. */
  after: string;
  /** Position of the current element within `elements`. */
  index: number;
  elements: ScriptElement[];
  format: ScriptFormat;
  /** Characters who speak in the other scripts of this project, with how many speeches each has. */
  projectCast: Record<string, number>;
}

const MAX = 8;

function uniq<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Case-insensitive match on the start of the string or of any word in it. */
function matches(candidate: string, typed: string): number {
  if (!typed) return 1;
  const c = candidate.toUpperCase();
  const t = typed.toUpperCase();
  if (c === t) return 4;
  if (c.startsWith(t)) return 3;
  if (c.split(/[\s./-]+/).some((w) => w.startsWith(t))) return 2;
  return 0;
}

function rank(candidates: string[], typed: string): string[] {
  return candidates
    .map((c, order) => ({ c, score: matches(c, typed), order }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.c);
}

/**
 * The cues that have dialogue, so a name counts only while it's really in the
 * script: a typo that was corrected, or a character whose every line was
 * deleted, drops out. `skip` is the cue being typed, so "J" never suggests itself.
 */
function speakingCues(elements: ScriptElement[], skip = -1): { index: number; name: string }[] {
  const out: { index: number; name: string }[] = [];
  elements.forEach((el, i) => {
    if (el.kind !== 'character' || i === skip) return;
    const name = characterName(plainText(el));
    if (!name || name.length > 40) return;
    for (let j = i + 1; j < elements.length; j++) {
      const next = elements[j];
      if (next.kind === 'parenthetical') continue;
      if (next.kind === 'dialogue' && plainText(next).trim()) out.push({ index: i, name });
      break;
    }
  });
  return out;
}

/** Characters who speak in `elements`, with how many speeches each has. */
export function castOf(elements: ScriptElement[]): Record<string, number> {
  const cast: Record<string, number> = {};
  for (const { name } of speakingCues(elements)) cast[name] = (cast[name] ?? 0) + 1;
  return cast;
}

/**
 * Who is likely to talk next? Walk back through the current scene: the
 * character who spoke before the current speaker comes first (conversations
 * alternate), then everyone else in the scene by recency, then the rest of
 * the cast by how often they speak.
 */
export function rankCharacters(
  elements: ScriptElement[],
  index: number,
  projectCast: Record<string, number>,
): { name: string; detail?: string }[] {
  const cues = speakingCues(elements, index);
  let sceneStart = -1;
  for (let i = index - 1; i >= 0; i--) {
    if (elements[i].kind === 'scene_heading' || elements[i].kind === 'act_start') {
      sceneStart = i;
      break;
    }
  }
  const recent: string[] = [];
  for (const cue of cues.filter((c) => c.index < index && c.index > sceneStart).reverse()) {
    if (!recent.includes(cue.name)) recent.push(cue.name);
  }
  const counts = new Map<string, number>();
  for (const { name } of cues) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const [name, n] of Object.entries(projectCast)) {
    const key = characterName(name);
    if (key && n > 0 && !counts.has(key)) counts.set(key, 0);
  }
  const byUse = Array.from(counts.keys()).sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff) return diff;
    const elsewhere = (projectCast[b] ?? 0) - (projectCast[a] ?? 0);
    return elsewhere || a.localeCompare(b);
  });

  const out: { name: string; detail?: string }[] = [];
  const lastSpeaker = recent[0];
  // Conversations ping-pong: the person before the last speaker is up next.
  if (recent.length >= 2) out.push({ name: recent[1], detail: 'next in scene' });
  for (const name of recent.slice(2)) out.push({ name, detail: 'in scene' });
  if (lastSpeaker) out.push({ name: lastSpeaker, detail: 'just spoke' });
  for (const name of byUse) {
    const inScript = (counts.get(name) ?? 0) > 0;
    out.push({ name, detail: inScript ? undefined : 'in project' });
  }
  return uniq(out, (x) => x.name);
}

function characterSuggestions(ctx: SuggestionContext): Suggestion[] {
  const { before, format } = ctx;
  // Typing an extension: "PAM (" → V.O., O.S. …
  const paren = before.lastIndexOf('(');
  if (paren >= 0 && !before.slice(paren).includes(')')) {
    const typed = before.slice(paren + 1).trim();
    return rank(format.vocabulary.extensions, typed)
      .slice(0, MAX)
      .map((ext) => ({ label: `(${ext})`, insert: `(${ext})`, from: paren }));
  }
  if (before.includes(')')) return [];
  const typed = before.trim();
  const ranked = rankCharacters(ctx.elements, ctx.index, ctx.projectCast);
  const names = typed ? ranked.filter((c) => matches(c.name, typed) > 0) : ranked;
  const ordered = typed
    ? names
        .map((c, order) => ({ c, order, score: matches(c.name, typed) }))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((x) => x.c)
    : names;
  return ordered
    .slice(0, MAX)
    .map((c) => ({ label: c.name, insert: c.name, from: 0, detail: c.detail }));
}

/** Locations used anywhere in the script, most used first. */
function knownLocations(elements: ScriptElement[]): string[] {
  const counts = new Map<string, number>();
  for (const el of elements) {
    if (el.kind !== 'scene_heading') continue;
    const { location } = parseSceneHeading(plainText(el));
    if (location) counts.set(location, (counts.get(location) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([l]) => l);
}

function sceneHeadingSuggestions(ctx: SuggestionContext): Suggestion[] {
  const { before, format, elements, index } = ctx;
  const upper = before.toUpperCase();
  const intros = format.vocabulary.sceneIntros;

  // 1. Still typing INT./EXT.
  const introMatch = /^(\S*)$/.exec(upper);
  if (introMatch) {
    const typed = introMatch[1];
    return rank(intros, typed.replace(/\.$/, ''))
      .filter((i) => i.startsWith(typed) || !typed)
      .map((i) => ({ label: i, insert: `${i} `, from: 0, chain: true }));
  }

  // 2. Location after the intro.
  const introEnd = /^(\S+)\s+/.exec(before);
  if (!introEnd || !/^(INT|EXT|EST|I\/E|INT\.?\/EXT|EXT\.?\/INT)\.?$/i.test(introEnd[1])) return [];
  const from = introEnd[0].length;
  const typedLocation = before.slice(from).trim().toUpperCase();

  // 3. After " - ": time of day (unless the text still matches a longer location).
  const dash = /\s[-–—]\s*([^-–—]*)$/.exec(upper);
  if (dash) {
    const typed = dash[1].trim();
    const timeFrom = before.length - dash[1].length;
    const used = elements
      .filter((el, i) => i !== index && el.kind === 'scene_heading')
      .map((el) => parseSceneHeading(plainText(el)).time)
      .filter(Boolean);
    const times = uniq([...format.vocabulary.times, ...used], (t) => t);
    const timeSuggestions = rank(times, typed)
      .slice(0, MAX)
      .map((t) => ({ label: t, insert: t, from: timeFrom }));
    if (timeSuggestions.length || !typed) return timeSuggestions;
  }

  const locations = knownLocations(elements.filter((_, i) => i !== index));
  return rank(locations, typedLocation)
    .slice(0, MAX)
    .map((l) => ({ label: l, insert: `${l} - `, from, chain: true }));
}

function listSuggestions(options: string[], before: string): Suggestion[] {
  const typed = before.trim();
  return rank(options, typed)
    .slice(0, MAX)
    .map((o) => ({ label: o, insert: o, from: 0 }));
}

/** The act that most likely comes next: the one after the last act so far in the format's sequence. */
function nextActName(ctx: SuggestionContext): string[] {
  const { actSequence, actNames } = ctx.format.vocabulary;
  const used = ctx.elements
    .slice(0, ctx.index)
    .filter((el) => el.kind === 'act_start')
    .map((el) => plainText(el).trim().toUpperCase());
  const last = used[used.length - 1];
  const at = last ? actSequence.indexOf(last) : -1;
  const next = actSequence.slice(at + 1).filter((n) => !used.includes(n));
  return uniq([...next, ...actSequence, ...actNames], (n) => n);
}

function actEndNames(ctx: SuggestionContext): string[] {
  const act = currentActName(ctx.elements, ctx.index);
  const { actSequence, actNames, endOfShow } = ctx.format.vocabulary;
  const options = act ? [`END OF ${act}`] : [];
  options.push(endOfShow, ...[...actSequence, ...actNames].map((n) => `END OF ${n}`));
  return uniq(options, (o) => o);
}

function parentheticalSuggestions(ctx: SuggestionContext): Suggestion[] {
  const { before, format } = ctx;
  const typed = before.trim();
  // "(to " → names of characters in the scene.
  const to = /^(to|re:)\s+(.*)$/i.exec(typed);
  if (to) {
    const names = rankCharacters(ctx.elements, ctx.index, {}).map((c) => c.name);
    const word = to[1].toLowerCase();
    const from = before.length - to[2].length;
    return rank(names, to[2])
      .slice(0, MAX)
      .map((n) => ({ label: `${word} ${n}`, insert: n, from }));
  }
  return listSuggestions(format.vocabulary.parentheticals, typed)
    .map((s) => ({ ...s, label: s.label.trim(), chain: s.insert.endsWith(' ') }));
}

export function getSuggestions(ctx: SuggestionContext): Suggestion[] {
  // Only complete at the end of the element's text.
  if (ctx.after.trim()) return [];
  switch (ctx.kind) {
    case 'character':
      return characterSuggestions(ctx);
    case 'scene_heading':
      return sceneHeadingSuggestions(ctx);
    case 'transition':
      return listSuggestions(ctx.format.vocabulary.transitions, ctx.before);
    case 'shot':
      return listSuggestions(ctx.format.vocabulary.shots, ctx.before);
    case 'act_start':
      return listSuggestions(nextActName(ctx), ctx.before);
    case 'act_end':
      return listSuggestions(actEndNames(ctx), ctx.before);
    case 'parenthetical':
      return parentheticalSuggestions(ctx);
    default:
      return [];
  }
}

