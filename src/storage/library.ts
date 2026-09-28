import { openDB, type IDBPDatabase } from 'idb';
import { characterName } from '../core/analysis';
import { displayTitle, sanitizeDraft, sanitizeProject, sanitizeScript } from '../core/script';
import type { SyncMeta } from '../cloud/types';
import type { Draft, Project, Script } from '../core/types';

/**
 * The writer's library, stored in the browser (IndexedDB) so it works
 * offline with no account:
 *
 *   projects  — a series or a film; groups scripts
 *   scripts   — the working copy of each script (projectId null = unfiled)
 *   drafts    — frozen iterations of a script, newest first
 *   sync      — what this device last synced to the cloud (see src/cloud)
 *
 * Falls back to memory when storage is unavailable (private windows,
 * sandboxed previews).
 */

export interface ScriptSummary {
  id: string;
  title: string;
  formatId: string;
  projectId: string | null;
  updatedAt: number;
  createdAt: number;
  drafts: number;
}

export interface Library {
  readonly persistent: boolean;
  list(): Promise<ScriptSummary[]>;
  load(id: string): Promise<Script | undefined>;
  /** Every script, in full. */
  allScripts(): Promise<Script[]>;
  save(script: Script): Promise<void>;
  /** Deletes the script and (unless `keepDrafts`) all of its drafts. */
  remove(id: string, options?: { keepDrafts?: boolean }): Promise<void>;

  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
  /** Deletes the project; its scripts are kept and become unfiled. */
  removeProject(id: string): Promise<void>;

  /** Drafts of one script, newest first. */
  listDrafts(scriptId: string): Promise<Draft[]>;
  loadDraft(id: string): Promise<Draft | undefined>;
  saveDraft(draft: Draft): Promise<void>;
  removeDraft(id: string): Promise<void>;

  /**
   * Character names remembered by the scripts in one project (or by all
   * unfiled scripts when `projectId` is null), with usage counts.
   */
  memory(options: { projectId: string | null; excludeId?: string }): Promise<Record<string, number>>;

  getPref<T>(key: string): Promise<T | undefined>;
  setPref(key: string, value: unknown): Promise<void>;

  getSyncMeta(key: string): Promise<SyncMeta | undefined>;
  allSyncMeta(): Promise<SyncMeta[]>;
  putSyncMeta(meta: SyncMeta): Promise<void>;
  deleteSyncMeta(key: string): Promise<void>;
}

/** The handful of operations the library needs from a key-value store. */
type Store = 'scripts' | 'projects' | 'drafts' | 'sync';

interface Backend {
  all(store: 'scripts' | 'projects' | 'sync'): Promise<unknown[]>;
  draftsOf(scriptId: string): Promise<unknown[]>;
  countDrafts(scriptId: string): Promise<number>;
  get(store: Store | 'prefs', key: string): Promise<unknown>;
  put(store: Store, value: { id: string } | SyncMeta): Promise<void>;
  putPref(key: string, value: unknown): Promise<void>;
  delete(store: Store, key: string): Promise<void>;
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

function readAll<T>(rows: unknown[], sanitize: (raw: unknown) => T): T[] {
  const out: T[] = [];
  for (const raw of rows) {
    try {
      out.push(sanitize(raw));
    } catch {
      // Skip unreadable records rather than failing the whole library.
    }
  }
  return out;
}

class LibraryImpl implements Library {
  constructor(
    private backend: Backend,
    readonly persistent: boolean,
  ) {}

  private async scripts(): Promise<Script[]> {
    return readAll(await this.backend.all('scripts'), sanitizeScript);
  }

  allScripts() {
    return this.scripts();
  }

  async list() {
    const scripts = await this.scripts();
    const summaries: ScriptSummary[] = [];
    for (const s of scripts) {
      summaries.push({
        id: s.id,
        title: displayTitle(s),
        formatId: s.formatId,
        projectId: s.projectId,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
        drafts: await this.backend.countDrafts(s.id),
      });
    }
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(id: string) {
    const raw = await this.backend.get('scripts', id);
    return raw ? sanitizeScript(raw) : undefined;
  }

  async save(script: Script) {
    await this.backend.put('scripts', structuredClone(script));
  }

  async remove(id: string, options: { keepDrafts?: boolean } = {}) {
    if (!options.keepDrafts) for (const d of await this.listDrafts(id)) await this.backend.delete('drafts', d.id);
    await this.backend.delete('scripts', id);
  }

  async listProjects() {
    return readAll(await this.backend.all('projects'), sanitizeProject).sort((a, b) => a.title.localeCompare(b.title));
  }

  async saveProject(project: Project) {
    await this.backend.put('projects', structuredClone(project));
  }

  async removeProject(id: string) {
    for (const s of await this.scripts()) {
      if (s.projectId === id) await this.save({ ...s, projectId: null });
    }
    await this.backend.delete('projects', id);
  }

  async listDrafts(scriptId: string) {
    return readAll(await this.backend.draftsOf(scriptId), sanitizeDraft).sort((a, b) => b.createdAt - a.createdAt);
  }

  async loadDraft(id: string) {
    const raw = await this.backend.get('drafts', id);
    return raw ? sanitizeDraft(raw) : undefined;
  }

  async saveDraft(draft: Draft) {
    await this.backend.put('drafts', structuredClone(draft));
  }

  async removeDraft(id: string) {
    await this.backend.delete('drafts', id);
  }

  async memory({ projectId, excludeId }: { projectId: string | null; excludeId?: string }) {
    return mergeMemory((await this.scripts()).filter((s) => s.id !== excludeId && s.projectId === projectId));
  }

  async getPref<T>(key: string) {
    return (await this.backend.get('prefs', key)) as T | undefined;
  }

  async setPref(key: string, value: unknown) {
    await this.backend.putPref(key, value);
  }

  async getSyncMeta(key: string) {
    return (await this.backend.get('sync', key)) as SyncMeta | undefined;
  }

  async allSyncMeta() {
    return (await this.backend.all('sync')) as SyncMeta[];
  }

  async putSyncMeta(meta: SyncMeta) {
    await this.backend.put('sync', { ...meta });
  }

  async deleteSyncMeta(key: string) {
    await this.backend.delete('sync', key);
  }
}

function idbBackend(db: IDBPDatabase): Backend {
  return {
    all: (store) => db.getAll(store),
    draftsOf: (scriptId) => db.getAllFromIndex('drafts', 'scriptId', scriptId),
    countDrafts: (scriptId) => db.countFromIndex('drafts', 'scriptId', scriptId),
    get: (store, key) => db.get(store, key),
    put: async (store, value) => {
      await db.put(store, value);
    },
    putPref: async (key, value) => {
      await db.put('prefs', value, key);
    },
    delete: (store, key) => db.delete(store, key),
  };
}

function memoryBackend(): Backend {
  const stores = {
    scripts: new Map<string, unknown>(),
    projects: new Map<string, unknown>(),
    drafts: new Map<string, unknown>(),
    sync: new Map<string, unknown>(),
    prefs: new Map<string, unknown>(),
  };
  const keyOf = (value: { id: string } | SyncMeta) => ('key' in value ? value.key : value.id);
  return {
    all: async (store) => Array.from(stores[store].values(), (v) => structuredClone(v)),
    draftsOf: async (scriptId) =>
      Array.from(stores.drafts.values())
        .filter((d) => (d as Draft).scriptId === scriptId)
        .map((d) => structuredClone(d)),
    countDrafts: async (scriptId) => Array.from(stores.drafts.values()).filter((d) => (d as Draft).scriptId === scriptId).length,
    get: async (store, key) => structuredClone(stores[store].get(key)),
    put: async (store, value) => {
      stores[store].set(keyOf(value), structuredClone(value));
    },
    putPref: async (key, value) => {
      stores.prefs.set(key, value);
    },
    delete: async (store, key) => {
      stores[store].delete(key);
    },
  };
}

/** A library that lives only in memory (tests, and browsers that block storage). */
export function memoryLibrary(): Library {
  return new LibraryImpl(memoryBackend(), false);
}

export async function openLibrary(): Promise<Library> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const db = await openDB('punchline', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('scripts', { keyPath: 'id' });
          db.createObjectStore('prefs');
        }
        if (oldVersion < 2) {
          // v2: projects and drafts. Existing scripts are upgraded as they're read.
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('drafts', { keyPath: 'id' }).createIndex('scriptId', 'scriptId');
        }
        if (oldVersion < 3) {
          // v3: cloud sync bookkeeping.
          db.createObjectStore('sync', { keyPath: 'key' });
        }
      },
    });
    return new LibraryImpl(idbBackend(db), true);
  } catch {
    return memoryLibrary();
  }
}
