import { plainText, type ScriptElement } from './types';

/** Words that mark the last part of a scene heading as a time of day. */
const TIME_WORDS =
  /\b(DAY|NIGHT|MORNING|AFTERNOON|EVENING|DAWN|DUSK|SUNRISE|SUNSET|NOON|MIDNIGHT|LATER|CONTINUOUS|SAME|MOMENTS|FLASHBACK|PRESENT|TALKING HEAD|CONT'D|CONTINUED)\b/;

const INTRO = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.|EXT\.|EST\.|INT |EXT |EST )\s*/i;

export interface SceneHeadingParts {
  intro: string;
  location: string;
  time: string;
}

/** Split "INT. DUNDER MIFFLIN - BULLPEN - DAY" into its parts. */
export function parseSceneHeading(text: string): SceneHeadingParts {
  const upper = text.toUpperCase().trim();
  const m = INTRO.exec(upper);
  const intro = m ? m[1].trim() : '';
  const rest = m ? upper.slice(m[0].length) : upper;
  const parts = rest.split(/\s+[-–—]\s+/);
  let time = '';
  if (parts.length > 1 && TIME_WORDS.test(parts[parts.length - 1])) {
    time = parts.pop()!.trim();
  }
  return { intro, location: parts.join(' - ').replace(/\s+-\s*$/, '').trim(), time };
}

/** True when text starts like a scene heading (INT./EXT./I/E./EST.). */
export function looksLikeSceneHeading(text: string): boolean {
  return /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i.test(text.trim() + ' ');
}

/** "PAM (V.O.)" → "PAM". Also drops Fountain's dual-dialogue caret and "@". */
export function characterName(text: string): string {
  return text
    .replace(/\(.*?\)/g, '')
    .replace(/\(.*$/, '')
    .replace(/\^\s*$/, '')
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** "PAM (V.O.) (CONT'D)" → ["V.O.", "CONT'D"]. */
export function characterExtensions(text: string): string[] {
  return Array.from(text.matchAll(/\(([^)]*)\)/g), (m) => m[1].trim().toUpperCase()).filter(Boolean);
}

export function hasContd(text: string): boolean {
  return characterExtensions(text).some((e) => /^CONT['’]?D$|^CONTINUED$/.test(e));
}

export interface SceneInfo {
  /** Index of the scene heading in the element list. */
  index: number;
  /** 1-based scene number. */
  number: number;
  heading: string;
  /** First bit of action in the scene, used as a synopsis. */
  synopsis: string;
  characters: string[];
  /** Index into `acts`, or -1 for scenes before any act heading. */
  act: number;
}

export interface ActInfo {
  index: number;
  name: string;
  scenes: SceneInfo[];
}

export interface CharacterStats {
  name: string;
  /** Number of speeches. */
  speeches: number;
  words: number;
  scenes: number;
  /** Element indices of every character cue for this character. */
  cues: number[];
}

export interface NoteInfo {
  index: number;
  text: string;
  /** Heading of the scene the note sits in, if any. */
  scene: string;
}

export interface ScriptAnalysis {
  acts: ActInfo[];
  /** Scenes that appear before the first act heading. */
  looseScenes: SceneInfo[];
  scenes: SceneInfo[];
  characters: CharacterStats[];
  notes: NoteInfo[];
  locations: string[];
  words: number;
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function analyzeScript(elements: ScriptElement[]): ScriptAnalysis {
  const acts: ActInfo[] = [];
  const looseScenes: SceneInfo[] = [];
  const scenes: SceneInfo[] = [];
  const notes: NoteInfo[] = [];
  const chars = new Map<string, CharacterStats & { sceneSet: Set<number> }>();
  const locations = new Map<string, number>();
  let scene: SceneInfo | null = null;
  let speaker: string | null = null;
  let words = 0;

  elements.forEach((el, index) => {
    const text = plainText(el);
    if (el.kind !== 'note') words += countWords(text);
    switch (el.kind) {
      case 'act_start':
        if (!text.trim()) break;
        acts.push({ index, name: text.trim().toUpperCase(), scenes: [] });
        scene = null;
        speaker = null;
        break;
      case 'scene_heading': {
        if (!text.trim()) break;
        const heading = text.trim().toUpperCase();
        scene = {
          index,
          number: scenes.length + 1,
          heading,
          synopsis: '',
          characters: [],
          act: acts.length - 1,
        };
        scenes.push(scene);
        (acts.length ? acts[acts.length - 1].scenes : looseScenes).push(scene);
        const { location } = parseSceneHeading(heading);
        if (location) locations.set(location, (locations.get(location) ?? 0) + 1);
        speaker = null;
        break;
      }
      case 'action':
        if (scene && !scene.synopsis && text.trim()) scene.synopsis = text.trim();
        break;
      case 'character': {
        const name = characterName(text);
        speaker = name || null;
        if (!name) break;
        let stats = chars.get(name);
        if (!stats) {
          stats = { name, speeches: 0, words: 0, scenes: 0, cues: [], sceneSet: new Set() };
          chars.set(name, stats);
        }
        stats.speeches++;
        stats.cues.push(index);
        const s = scene as SceneInfo | null;
        if (s) {
          stats.sceneSet.add(s.index);
          if (!s.characters.includes(name)) s.characters.push(name);
        }
        break;
      }
      case 'dialogue':
        if (speaker) chars.get(speaker)!.words += countWords(text);
        break;
      case 'note':
        if (text.trim()) notes.push({ index, text: text.trim(), scene: (scene as SceneInfo | null)?.heading ?? '' });
        break;
      default:
        break;
    }
  });

  const characters = Array.from(chars.values())
    .map(({ sceneSet, ...rest }) => ({ ...rest, scenes: sceneSet.size }))
    .sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name));

  const locationList = Array.from(locations.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  return { acts, looseScenes, scenes, characters, notes, locations: locationList, words };
}

/**
 * Character cues that should print with an automatic (CONT'D): the same
 * character speaks again in the same scene with only action in between.
 */
export function autoContdCues(elements: ScriptElement[]): Set<number> {
  const result = new Set<number>();
  let last: string | null = null;
  elements.forEach((el, index) => {
    switch (el.kind) {
      case 'scene_heading':
      case 'act_start':
      case 'act_end':
      case 'transition':
        last = null;
        break;
      case 'character': {
        const text = plainText(el);
        const name = characterName(text);
        if (!name) break;
        if (name === last && !hasContd(text)) result.add(index);
        last = name;
        break;
      }
      default:
        break;
    }
  });
  return result;
}

/** Name of the act an element belongs to, e.g. "ACT ONE" — used for "END OF …" suggestions. */
export function currentActName(elements: ScriptElement[], upTo: number): string | null {
  for (let i = Math.min(upTo, elements.length - 1); i >= 0; i--) {
    const el = elements[i];
    if (el.kind === 'act_start' && plainText(el).trim()) return plainText(el).trim().toUpperCase();
    if (el.kind === 'act_end' && i !== upTo) return null;
  }
  return null;
}
