import { openDB, type IDBPDatabase } from 'idb';
import { characterName } from '../core/analysis';
import { displayTitle, sanitizeScript } from '../core/script';
import type { Script } from '../core/types';

/**
 * The writer's script library, stored in the browser (IndexedDB) so it
 * works offline with no account. Falls back to memory when storage is
 * unavailable (private windows, sandboxed previews).
 *
 * Version 2 builds on this with projects (a series) and drafts
 * (iterations of one episode); see docs/ROADMAP.md.
 */

export interface ScriptSummary {
  id: string;
  title: string;
  formatId: string;
  updatedAt: number;
  createdAt: number;
}

export interface Library {
  readonly persistent: boolean;
  list(): Promise<ScriptSummary[]>;
  load(id: string): Promise<Script | undefined>;
  save(script: Script): Promise<void>;
  remove(id: string): Promise<void>;
  /** Character names remembered across every script (optionally except one), with usage counts. */
  memory(excludeId?: string): Promise<Record<string, number>>;
  getPref<T>(key: string): Promise<T | undefined>;
  setPref(key: string, value: unknown): Promise<void>;
}

function summarize(script: Script): ScriptSummary {
  return {
    id: script.id,
    title: displayTitle(script),
    formatId: script.formatId,
    updatedAt: script.updatedAt,
    createdAt: script.createdAt,
  };
}

function mergeMemory(scripts: Script[]): Record<string, number> {
  const memory: Record<string, number> = {};
  for (const s of scripts) {
    for (const [name, n] of Object.entries(s.characterMemory ?? {})) {
      const key = characterName(name);
      if (key) memory[key] = (memory[key] ?? 0) + n;
    }
  }
  return memory;
}

const byRecent = (a: ScriptSummary, b: ScriptSummary) => b.updatedAt - a.updatedAt;

class IdbLibrary implements Library {
  readonly persistent = true;
  constructor(private db: IDBPDatabase) {}

  private async all(): Promise<Script[]> {
    const raw = await this.db.getAll('scripts');
    const scripts: Script[] = [];
    for (const r of raw) {
      try {
        scripts.push(sanitizeScript(r));
      } catch {
        // Skip unreadable records rather than failing the whole library.
      }
    }
    return scripts;
  }

  async list() {
    return (await this.all()).map(summarize).sort(byRecent);
  }
  async load(id: string) {
    const raw = await this.db.get('scripts', id);
    return raw ? sanitizeScript(raw) : undefined;
  }
  async save(script: Script) {
    await this.db.put('scripts', structuredClone(script));
  }
  async remove(id: string) {
    await this.db.delete('scripts', id);
  }
  async memory(excludeId?: string) {
    return mergeMemory((await this.all()).filter((s) => s.id !== excludeId));
  }
  async getPref<T>(key: string) {
    return (await this.db.get('prefs', key)) as T | undefined;
  }
  async setPref(key: string, value: unknown) {
    await this.db.put('prefs', value, key);
  }
}

export class MemoryLibrary implements Library {
  readonly persistent = false;
  private scripts = new Map<string, Script>();
  private prefs = new Map<string, unknown>();

  async list() {
    return Array.from(this.scripts.values()).map(summarize).sort(byRecent);
  }
  async load(id: string) {
    const s = this.scripts.get(id);
    return s ? structuredClone(s) : undefined;
  }
  async save(script: Script) {
    this.scripts.set(script.id, structuredClone(script));
  }
  async remove(id: string) {
    this.scripts.delete(id);
  }
  async memory(excludeId?: string) {
    return mergeMemory(Array.from(this.scripts.values()).filter((s) => s.id !== excludeId));
  }
  async getPref<T>(key: string) {
    return this.prefs.get(key) as T | undefined;
  }
  async setPref(key: string, value: unknown) {
    this.prefs.set(key, value);
  }
}

export async function openLibrary(): Promise<Library> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const db = await openDB('punchline', 1, {
      upgrade(db) {
        db.createObjectStore('scripts', { keyPath: 'id' });
        db.createObjectStore('prefs');
      },
    });
    return new IdbLibrary(db);
  } catch {
    return new MemoryLibrary();
  }
}
