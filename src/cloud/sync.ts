import { createDraft, displayTitle } from '../core/script';
import type { Draft, Project, Script } from '../core/types';
import type { Library } from '../storage/library';
import { hashDraft, hashProject, hashScript } from './hash';
import {
  metaKey,
  type CloudBackend,
  type CloudUser,
  type Listing,
  type RemoteDraft,
  type RemoteProject,
  type RemoteScript,
  type SyncMeta,
  type SyncStatus,
  type Unsubscribe,
} from './types';

/**
 * Keeps the local library and the cloud in step.
 *
 * The local library stays the source of truth for the app, so writing works
 * offline exactly as before. This engine:
 *   • uploads projects, and the scripts and drafts inside them, a few seconds
 *     after they change (scripts outside a project stay on this device);
 *   • listens to the cloud and applies changes made on other devices;
 *   • never loses work: if a script was changed both here and elsewhere, this
 *     device's version is kept and the other one is saved as a draft.
 *
 * For each record it remembers the server revision and a hash of the content
 * it last synced (SyncMeta). A local copy whose hash differs has unsynced
 * edits; a server copy whose revision differs has changes from elsewhere.
 */

export interface SyncHooks {
  /** Local data changed because of the cloud; refresh what's on screen. */
  onRemoteChange(change: { projects?: boolean; scripts?: string[]; drafts?: string[] }): void;
  onStatus(status: SyncStatus, detail?: string): void;
  onNotice(message: string): void;
  /** May a cloud update overwrite this script now? Return false while it is being edited. */
  canApply(scriptId: string): boolean;
}

export interface SyncOptions {
  /** Wait this long after a local change before uploading (edits made meanwhile ride along). */
  pushDelay: number;
  /** First retry delay after a failed upload; doubles up to a minute. */
  retryDelay: number;
  /** How often to retry applying cloud changes to a script that is being edited. */
  deferDelay: number;
}

const ORDER: Record<SyncMeta['type'], number> = { project: 0, script: 1, draft: 2 };

/**
 * Deleting something that's already gone (or in a project we've since lost
 * access to) is refused by the security rules. Either way it isn't there.
 */
async function ignoreGone(task: () => Promise<void>) {
  try {
    await task();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== 'permission-denied' && code !== 'not-found') throw e;
  }
}

export class SyncEngine {
  private queue = new Set<string>();
  private deferred = new Map<string, { projectId: string; remote: RemoteScript }>();
  private unsubs: Unsubscribe[] = [];
  private watching = new Map<string, Unsubscribe[]>();
  private chain: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deferTimer: ReturnType<typeof setTimeout> | null = null;
  private removals = new Map<string, { projectId: string; rev: number }>();
  private removalTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay: number;
  private running = false;
  /**
   * Records this device uploaded that no listing has shown yet. A listing can
   * be older than an upload that has already finished (it was computed on the
   * server before the upload landed), so a record missing from a listing is
   * only treated as deleted once a listing has shown it.
   */
  private unconfirmed = new Map<string, { projectId: string; rev: number }>();
  private status: SyncStatus = 'connecting';
  private readonly options: SyncOptions;

  constructor(
    private lib: Library,
    private cloud: CloudBackend,
    readonly user: CloudUser,
    private hooks: SyncHooks,
    options: Partial<SyncOptions> = {},
  ) {
    this.options = { pushDelay: 3000, retryDelay: 2000, deferDelay: 2000, ...options };
    this.retryDelay = this.options.retryDelay;
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    this.running = true;
    this.setStatus('connecting');
    // Anything changed while signed out or offline gets checked for upload.
    await this.queueEverything();
    this.unsubs.push(
      this.cloud.watchProjects(
        this.user.uid,
        (listing) => this.fromCloud(() => this.onProjects(listing)),
        (e) => this.onError(e),
      ),
    );
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    for (const u of this.unsubs) u();
    for (const us of this.watching.values()) us.forEach((u) => u());
    this.unsubs = [];
    this.watching.clear();
    if (this.timer) clearTimeout(this.timer);
    if (this.deferTimer) clearTimeout(this.deferTimer);
    if (this.removalTimer) clearTimeout(this.removalTimer);
    this.deferTimer = null;
    this.removalTimer = null;
  }

  /** Local records changed (called by SyncedLibrary). */
  touch(keys: string[]): void {
    for (const k of keys) this.queue.add(k);
    this.schedule(this.options.pushDelay);
  }

  /** Upload everything pending now; resolves when done. */
  async syncNow(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.serial(() => this.flush());
    await this.chain;
  }

  /** Wait for work already scheduled or in progress (used by tests). */
  async idle(): Promise<void> {
    let before: Promise<unknown>;
    do {
      before = this.chain;
      await before;
    } while (before !== this.chain);
  }

  // ----------------------------------------------------------------- helpers

  /** Run tasks one at a time so local and remote updates never interleave. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Apply a cloud update in turn with everything else, reporting failures. */
  private fromCloud(task: () => Promise<void>) {
    this.serial(task).catch((e) => this.onError(e));
  }

  private schedule(delay: number) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.serial(() => this.flush());
    }, delay);
  }

  private setStatus(status: SyncStatus, detail?: string) {
    this.status = status;
    this.hooks.onStatus(status, detail);
  }

  private onError(e: unknown) {
    const code = (e as { code?: string })?.code ?? '';
    if (code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      this.setStatus('offline');
    } else {
      this.setStatus('error', e instanceof Error ? e.message : String(e));
    }
  }

  private async queueEverything() {
    const projects = await this.lib.listProjects();
    for (const p of projects) this.queue.add(metaKey('project', p.id));
    for (const s of await this.lib.allScripts()) {
      if (s.projectId) this.queue.add(metaKey('script', s.id));
      if (s.projectId) for (const d of await this.lib.listDrafts(s.id)) this.queue.add(metaKey('draft', d.id));
    }
    // Pending deletions, and scripts moved out of their project while signed out.
    for (const m of await this.lib.allSyncMeta()) this.queue.add(m.key);
  }

  private async projectMeta(projectId: string) {
    return this.lib.getSyncMeta(metaKey('project', projectId));
  }

  /** `uploaded`: written to the cloud by this device, rather than read from a listing. */
  private async saveMeta(meta: SyncMeta, uploaded = false) {
    if (uploaded) this.unconfirmed.set(meta.key, { projectId: meta.projectId, rev: meta.rev });
    await this.lib.putSyncMeta(meta);
  }

  /** A listing shows this revision of the record. */
  private seen(key: string, projectId: string, rev: number) {
    const mine = this.unconfirmed.get(key);
    if (mine && mine.projectId === projectId && mine.rev <= rev) this.unconfirmed.delete(key);
  }

  // -------------------------------------------------------------------- push

  private async flush(): Promise<void> {
    if (!this.running || !this.queue.size) {
      if (this.running && this.status !== 'offline' && this.status !== 'error') this.setStatus('synced');
      return;
    }
    this.setStatus('syncing');
    const keys = Array.from(this.queue).sort((a, b) => ORDER[a.split(':')[0] as SyncMeta['type']] - ORDER[b.split(':')[0] as SyncMeta['type']]);
    this.queue.clear();
    let failed: unknown = null;
    for (const key of keys) {
      try {
        await this.pushKey(key);
      } catch (e) {
        failed = e;
        this.queue.add(key);
      }
    }
    if (failed) {
      this.onError(failed);
      this.schedule(this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
      return;
    }
    this.retryDelay = this.options.retryDelay;
    if (this.queue.size) this.schedule(this.options.pushDelay);
    else this.setStatus('synced');
  }

  private async pushKey(key: string) {
    const [type, id] = key.split(/:(.*)/s) as [SyncMeta['type'], string];
    const meta = await this.lib.getSyncMeta(key);
    if (meta?.deleted) return this.pushDelete(meta);
    if (type === 'project') return this.pushProject(id, meta);
    if (type === 'script') return this.pushScript(id, meta);
    return this.pushDraft(id, meta);
  }

  private async pushDelete(meta: SyncMeta) {
    await ignoreGone(async () => {
      if (meta.type === 'project') await this.cloud.deleteProject(meta.id);
      if (meta.type === 'script') await this.cloud.deleteScript(meta.projectId, meta.id);
      if (meta.type === 'draft') await this.cloud.deleteDraft(meta.projectId, meta.id);
    });
    await this.lib.deleteSyncMeta(meta.key);
  }

  private async pushProject(id: string, meta: SyncMeta | undefined) {
    const project = (await this.lib.listProjects()).find((p) => p.id === id);
    if (!project) {
      if (meta) await this.pushDelete(meta);
      return;
    }
    const hash = hashProject(project);
    if (meta && meta.hash === hash) return;
    let res = await this.cloud.putProject(this.user.uid, project, meta?.rev ?? null);
    if (!res.ok) {
      // Deleted in the cloud while we had it: the listener will take it out of here.
      if (!res.current) return;
      // Renamed elsewhere too: a title is small, so this device's wins.
      res = await this.cloud.putProject(this.user.uid, project, res.current.rev);
      if (!res.ok) throw new Error('The project changed again while syncing.');
    }
    await this.saveMeta({ key: metaKey('project', id), type: 'project', id, projectId: id, rev: res.rev, hash }, true);
  }

  /** Remove a script's old cloud copy (and its drafts') after it left that project. */
  private async detachScript(old: SyncMeta) {
    await ignoreGone(() => this.cloud.deleteScript(old.projectId, old.id));
    const current = await this.lib.getSyncMeta(old.key);
    if (current && current.projectId === old.projectId) await this.lib.deleteSyncMeta(old.key);
    // Its drafts follow it: re-queue them so they move (or leave the cloud) too.
    for (const d of await this.lib.listDrafts(old.id)) this.queue.add(metaKey('draft', d.id));
  }

  private async pushScript(id: string, meta: SyncMeta | undefined) {
    const script = await this.lib.load(id);
    if (!script) {
      if (meta) await this.pushDelete(meta);
      return;
    }
    // Moved to another project (or out of all of them): upload the new copy
    // first, then remove the old one, so other devices never see it vanish.
    let moved: SyncMeta | undefined;
    if (meta && meta.projectId !== script.projectId) {
      moved = meta;
      meta = undefined;
    }
    if (script.projectId) await this.uploadScript({ ...script, projectId: script.projectId }, meta);
    if (moved) await this.detachScript(moved);
  }

  private async uploadScript(script: Script & { projectId: string }, meta: SyncMeta | undefined) {
    const { id, projectId } = script;
    if (!(await this.projectMeta(projectId))) {
      await this.pushProject(projectId, undefined);
      if (!(await this.projectMeta(projectId))) return;
    }
    const hash = hashScript(script);
    if (meta && meta.hash === hash) return;

    let res = await this.cloud.putScript(this.user.uid, projectId, script, meta?.rev ?? null);
    if (!res.ok) {
      const current = res.current;
      if (current && hashScript(current.script) === hash) {
        // Same words on both sides; just catch up with the revision.
        await this.saveMeta({ key: metaKey('script', id), type: 'script', id, projectId, rev: current.rev, hash }, true);
        return;
      }
      // Changed both here and elsewhere: keep ours, save theirs as a draft.
      if (current) await this.keepAsDraft(script, current.script);
      res = await this.cloud.putScript(this.user.uid, projectId, script, current ? current.rev : null);
      if (!res.ok) throw new Error('The script changed again while syncing.');
    }
    await this.saveMeta({ key: metaKey('script', id), type: 'script', id, projectId, rev: res.rev, hash }, true);
  }

  private isDirty(script: Script, meta: SyncMeta) {
    return hashScript(script) !== meta.hash;
  }

  /** Both devices changed a script: keep the other device's version as a draft of this one. */
  private async keepAsDraft(local: Script, theirs: Script) {
    const when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const draft = createDraft(
      { ...theirs, id: local.id },
      { name: 'From another device', note: `Saved automatically ${when}: this script was also changed on another device.` },
    );
    await this.lib.saveDraft(draft);
    this.queue.add(metaKey('draft', draft.id));
    this.hooks.onRemoteChange({ drafts: [local.id] });
    this.hooks.onNotice(`“${displayTitle(local)}” was also changed on another device. That version is saved as a draft, so you can compare the two.`);
  }

  private async pushDraft(id: string, meta: SyncMeta | undefined) {
    const draft = await this.lib.loadDraft(id);
    if (!draft) {
      if (meta) await this.pushDelete(meta);
      return;
    }
    const projectId = (await this.lib.load(draft.scriptId))?.projectId ?? null;
    const moved = meta && meta.projectId !== projectId ? meta : undefined;
    if (moved) meta = undefined;
    if (projectId && (await this.projectMeta(projectId))) {
      const hash = hashDraft(draft);
      if (!meta || meta.hash !== hash) {
        const rev = await this.cloud.putDraft(this.user.uid, projectId, draft);
        await this.saveMeta({ key: metaKey('draft', id), type: 'draft', id, projectId, rev, hash }, true);
      }
    }
    if (moved) {
      await ignoreGone(() => this.cloud.deleteDraft(moved.projectId, id));
      const current = await this.lib.getSyncMeta(moved.key);
      if (current && current.projectId === moved.projectId) await this.lib.deleteSyncMeta(moved.key);
    }
  }

  // -------------------------------------------------------------------- pull

  private watchProject(projectId: string) {
    if (this.watching.has(projectId)) return;
    const onError = (e: unknown) => this.onError(e);
    this.watching.set(projectId, [
      this.cloud.watchScripts(
        projectId,
        (l) => this.fromCloud(() => this.onScripts(projectId, l)),
        onError,
      ),
      this.cloud.watchDrafts(
        projectId,
        (l) => this.fromCloud(() => this.onDrafts(projectId, l)),
        onError,
      ),
    ]);
  }

  private unwatchProject(projectId: string) {
    this.watching.get(projectId)?.forEach((u) => u());
    this.watching.delete(projectId);
  }

  private async onProjects(listing: Listing<RemoteProject>) {
    if (!this.running) return;
    let changed = false;
    const locals = new Map((await this.lib.listProjects()).map((p) => [p.id, p]));
    const remoteIds = new Set<string>();
    for (const remote of listing.items) {
      const { project } = remote;
      remoteIds.add(project.id);
      const key = metaKey('project', project.id);
      this.seen(key, project.id, remote.rev);
      const meta = await this.lib.getSyncMeta(key);
      if (meta?.deleted || (meta && remote.rev < meta.rev)) continue; // deleted here, or an old snapshot
      const local = locals.get(project.id);
      const remoteHash = hashProject(project);
      const record = (hash: string): SyncMeta => ({ key, type: 'project', id: project.id, projectId: project.id, rev: remote.rev, hash });
      if (!local) {
        await this.lib.saveProject(project);
        await this.saveMeta(record(remoteHash));
        changed = true;
      } else if (!meta || meta.rev !== remote.rev) {
        const localHash = hashProject(local);
        if (localHash === remoteHash) await this.saveMeta(record(remoteHash));
        else if (meta && localHash === meta.hash) {
          await this.lib.saveProject({ ...local, title: project.title, formatId: project.formatId, updatedAt: project.updatedAt });
          await this.saveMeta(record(remoteHash));
          changed = true;
        } else this.queue.add(key); // changed here too: ours is uploaded
      }
      this.watchProject(project.id);
    }
    // Only trust "it's gone" when the server itself says so, never a cache.
    if (listing.fromServer) {
      for (const local of locals.values()) {
        const meta = await this.projectMeta(local.id);
        if (meta && !meta.deleted && !remoteIds.has(local.id) && !this.unconfirmed.has(meta.key)) {
          await this.unfileProject(local.id);
          changed = true;
        }
      }
      if (this.status === 'connecting') this.setStatus('synced');
    }
    if (this.queue.size) this.schedule(this.options.pushDelay);
    if (changed) this.hooks.onRemoteChange({ projects: true });
  }

  /** A project was deleted in the cloud: keep its scripts here, outside any project. */
  private async unfileProject(projectId: string) {
    this.unwatchProject(projectId);
    for (const m of await this.lib.allSyncMeta()) if (m.projectId === projectId) await this.lib.deleteSyncMeta(m.key);
    await this.lib.removeProject(projectId);
  }

  private async applyRemoteScript(projectId: string, remote: RemoteScript) {
    const script: Script = { ...remote.script, projectId };
    await this.lib.save(script);
    await this.saveMeta({
      key: metaKey('script', script.id),
      type: 'script',
      id: script.id,
      projectId,
      rev: remote.rev,
      hash: hashScript(script),
    });
    this.hooks.onRemoteChange({ scripts: [script.id] });
  }

  private async onScripts(projectId: string, listing: Listing<RemoteScript>) {
    if (!this.running) return;
    const remoteIds = new Set<string>();
    for (const remote of listing.items) {
      const id = remote.script.id;
      remoteIds.add(id);
      const key = metaKey('script', id);
      this.seen(key, projectId, remote.rev);
      const meta = await this.lib.getSyncMeta(key);
      if (meta?.deleted) continue;
      const local = await this.lib.load(id);
      if (!local) {
        await this.applyRemoteScript(projectId, remote);
        continue;
      }
      // Already have this revision, or a newer one (the listing is an old snapshot).
      if (meta && meta.projectId === projectId && remote.rev <= meta.rev) continue;
      const localHash = hashScript(local);
      const remoteHash = hashScript(remote.script);
      const unchangedHere = meta ? localHash === meta.hash : localHash === remoteHash;
      if (meta && meta.projectId !== projectId && local.projectId === meta.projectId && unchangedHere) {
        // Moved to this project on another device.
        await this.applyRemoteScript(projectId, remote);
        continue;
      }
      if (local.projectId !== projectId) continue; // moved here; the upload sorts it out
      if (localHash === remoteHash) {
        await this.saveMeta({ key, type: 'script', id, projectId, rev: remote.rev, hash: remoteHash });
      } else if (!unchangedHere) {
        this.queue.add(key); // edited here too: resolved on upload
      } else if (!this.hooks.canApply(id)) {
        this.defer(id, projectId, remote);
      } else {
        await this.applyRemoteScript(projectId, remote);
      }
    }
    if (listing.fromServer) {
      for (const m of await this.lib.allSyncMeta()) {
        if (m.type !== 'script' || m.projectId !== projectId || m.deleted || remoteIds.has(m.id) || this.unconfirmed.has(m.key)) continue;
        // Gone from this project. It may have been deleted, or moved to another
        // project whose listing hasn't arrived yet: decide after a moment.
        this.removals.set(m.id, { projectId, rev: m.rev });
        this.scheduleRemovals();
      }
    }
    if (this.queue.size) this.schedule(this.options.pushDelay);
  }

  private scheduleRemovals() {
    if (this.removalTimer) return;
    this.removalTimer = setTimeout(() => {
      this.removalTimer = null;
      this.fromCloud(() => this.applyRemovals());
    }, this.options.deferDelay);
  }

  private async applyRemovals() {
    const pending = Array.from(this.removals.entries());
    this.removals.clear();
    for (const [id, { projectId, rev }] of pending) {
      const meta = await this.lib.getSyncMeta(metaKey('script', id));
      // Moved, re-uploaded or already handled since.
      if (!meta || meta.deleted || meta.projectId !== projectId || meta.rev !== rev) continue;
      const local = await this.lib.load(id);
      if (local && local.projectId === projectId && this.isDirty(local, meta)) {
        this.queue.add(meta.key); // deleted elsewhere but edited here: upload it again
        continue;
      }
      await this.lib.deleteSyncMeta(meta.key);
      if (local && local.projectId === projectId) {
        // Drafts go too, unless they've already moved with the script to another project.
        for (const d of await this.lib.listDrafts(id)) {
          const dm = await this.lib.getSyncMeta(metaKey('draft', d.id));
          if (dm && dm.projectId !== projectId) continue;
          if (dm) await this.lib.deleteSyncMeta(dm.key);
          await this.lib.removeDraft(d.id);
        }
        await this.lib.remove(id, { keepDrafts: true });
        this.hooks.onRemoteChange({ scripts: [id] });
      }
    }
    if (this.queue.size) this.schedule(this.options.pushDelay);
  }

  /** The script is open and being edited: apply the cloud version once typing pauses. */
  private defer(id: string, projectId: string, remote: RemoteScript) {
    this.deferred.set(id, { projectId, remote });
    if (this.deferTimer) return;
    this.deferTimer = setTimeout(() => {
      this.deferTimer = null;
      void this.serial(() => this.retryDeferred());
    }, this.options.deferDelay);
  }

  private async retryDeferred() {
    const pending = Array.from(this.deferred.entries());
    this.deferred.clear();
    for (const [id, { projectId, remote }] of pending) {
      const local = await this.lib.load(id);
      const meta = await this.lib.getSyncMeta(metaKey('script', id));
      if (!local || !meta || meta.rev >= remote.rev) continue;
      if (this.isDirty(local, meta)) this.queue.add(meta.key);
      else if (this.hooks.canApply(id)) await this.applyRemoteScript(projectId, remote);
      else this.defer(id, projectId, remote);
    }
    if (this.queue.size) this.schedule(this.options.pushDelay);
  }

  private async onDrafts(projectId: string, listing: Listing<RemoteDraft>) {
    if (!this.running) return;
    const changedScripts = new Set<string>();
    const remoteIds = new Set<string>();
    for (const remote of listing.items) {
      const { draft } = remote;
      remoteIds.add(draft.id);
      const key = metaKey('draft', draft.id);
      this.seen(key, projectId, remote.rev);
      const meta = await this.lib.getSyncMeta(key);
      if (meta?.deleted || (meta && meta.projectId === projectId && remote.rev <= meta.rev)) continue;
      await this.lib.saveDraft(draft);
      await this.saveMeta({ key, type: 'draft', id: draft.id, projectId, rev: remote.rev, hash: hashDraft(draft) });
      changedScripts.add(draft.scriptId);
    }
    if (listing.fromServer) {
      for (const m of await this.lib.allSyncMeta()) {
        if (m.type !== 'draft' || m.projectId !== projectId || m.deleted || remoteIds.has(m.id) || this.unconfirmed.has(m.key)) continue;
        const local: Draft | undefined = await this.lib.loadDraft(m.id);
        await this.lib.deleteSyncMeta(m.key);
        if (local) {
          await this.lib.removeDraft(m.id);
          changedScripts.add(local.scriptId);
        }
      }
    }
    if (changedScripts.size) this.hooks.onRemoteChange({ drafts: Array.from(changedScripts) });
  }
}

/**
 * The library the app uses once cloud sync is available: every write goes to
 * the local library as before, and tells the sync engine what changed.
 * Deletions leave a tombstone so the cloud copy is deleted too, even if the
 * deletion happened while signed out.
 */
export class SyncedLibrary implements Library {
  engine: SyncEngine | null = null;

  constructor(readonly base: Library) {}

  get persistent() {
    return this.base.persistent;
  }

  private touch(keys: string[]) {
    this.engine?.touch(keys);
  }

  private async tombstone(type: SyncMeta['type'], id: string) {
    const meta = await this.base.getSyncMeta(metaKey(type, id));
    if (meta) await this.base.putSyncMeta({ ...meta, deleted: true });
    return metaKey(type, id);
  }

  list() {
    return this.base.list();
  }
  load(id: string) {
    return this.base.load(id);
  }
  allScripts() {
    return this.base.allScripts();
  }
  async save(script: Script) {
    await this.base.save(script);
    this.touch([metaKey('script', script.id)]);
  }
  async remove(id: string, options: { keepDrafts?: boolean } = {}) {
    const keys = [await this.tombstone('script', id)];
    if (!options.keepDrafts) for (const d of await this.base.listDrafts(id)) keys.push(await this.tombstone('draft', d.id));
    await this.base.remove(id, options);
    this.touch(keys);
  }
  listProjects() {
    return this.base.listProjects();
  }
  async saveProject(project: Project) {
    await this.base.saveProject(project);
    this.touch([metaKey('project', project.id)]);
  }
  async removeProject(id: string) {
    // Its scripts stay on this device, outside any project; their cloud copies go with the project.
    const members = (await this.base.allScripts()).filter((s) => s.projectId === id);
    const keys = [await this.tombstone('project', id), ...members.map((s) => metaKey('script', s.id))];
    await this.base.removeProject(id);
    this.touch(keys);
  }
  listDrafts(scriptId: string) {
    return this.base.listDrafts(scriptId);
  }
  loadDraft(id: string) {
    return this.base.loadDraft(id);
  }
  async saveDraft(draft: Draft) {
    await this.base.saveDraft(draft);
    this.touch([metaKey('draft', draft.id)]);
  }
  async removeDraft(id: string) {
    const key = await this.tombstone('draft', id);
    await this.base.removeDraft(id);
    this.touch([key]);
  }
  memory(options: { projectId: string | null; excludeId?: string }) {
    return this.base.memory(options);
  }
  getPref<T>(key: string) {
    return this.base.getPref<T>(key);
  }
  setPref(key: string, value: unknown) {
    return this.base.setPref(key, value);
  }
  getSyncMeta(key: string) {
    return this.base.getSyncMeta(key);
  }
  allSyncMeta() {
    return this.base.allSyncMeta();
  }
  putSyncMeta(meta: SyncMeta) {
    return this.base.putSyncMeta(meta);
  }
  deleteSyncMeta(key: string) {
    return this.base.deleteSyncMeta(key);
  }
}
