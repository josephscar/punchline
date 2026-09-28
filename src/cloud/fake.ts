import type { Draft, Project, Script } from '../core/types';
import type { CloudBackend, Listing, PutResult, RemoteDraft, RemoteProject, RemoteScript, Unsubscribe } from './types';

type Watcher<T> = { onChange: (l: Listing<T>) => void };

/**
 * An in-memory cloud with the same behaviour as the Firestore backend:
 * revision checks on write, full listings pushed to watchers after every
 * change, and membership-based visibility. Used by the sync engine's tests
 * to simulate several devices sharing one account.
 */
export class FakeCloud implements CloudBackend {
  projects = new Map<string, RemoteProject>();
  scripts = new Map<string, Map<string, RemoteScript>>();
  drafts = new Map<string, Map<string, RemoteDraft>>();
  /** While true every call fails as if the network were down. */
  offline = false;
  /** While true listings come from a (empty) cache instead of the server. */
  cacheOnly = false;
  /**
   * Listings reach watchers this many milliseconds after the change they
   * show, like a real listener that lags behind writes that have already
   * finished.
   */
  lag = 0;
  writes = 0;
  private projectWatchers = new Map<Watcher<RemoteProject>, string>();
  private scriptWatchers = new Map<Watcher<RemoteScript>, string>();
  private draftWatchers = new Map<Watcher<RemoteDraft>, string>();

  private check() {
    if (this.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  }

  /** Deliver a listing as it is now, after the configured lag. */
  private deliver<T>(watchers: Map<Watcher<T>, string>, w: Watcher<T>, listing: Listing<T>) {
    const send = () => watchers.has(w) && w.onChange(listing);
    if (this.lag) setTimeout(send, this.lag);
    else queueMicrotask(send);
  }

  private notify() {
    for (const [w, uid] of this.projectWatchers) this.deliver(this.projectWatchers, w, this.projectListing(uid));
    for (const [w, pid] of this.scriptWatchers) this.deliver(this.scriptWatchers, w, this.listing(this.scripts.get(pid)));
    for (const [w, pid] of this.draftWatchers) this.deliver(this.draftWatchers, w, this.listing(this.drafts.get(pid)));
  }

  private listing<T>(items: Map<string, T> | undefined): Listing<T> {
    if (this.cacheOnly) return { items: [], fromServer: false };
    return { items: Array.from(items?.values() ?? []).map((x) => structuredClone(x)), fromServer: true };
  }

  private projectListing(uid: string): Listing<RemoteProject> {
    if (this.cacheOnly) return { items: [], fromServer: false };
    return { items: Array.from(this.projects.values()).filter((p) => p.memberIds.includes(uid)).map((x) => structuredClone(x)), fromServer: true };
  }

  watchProjects(uid: string, onChange: (l: Listing<RemoteProject>) => void): Unsubscribe {
    const w = { onChange };
    this.projectWatchers.set(w, uid);
    this.deliver(this.projectWatchers, w, this.projectListing(uid));
    return () => this.projectWatchers.delete(w);
  }

  watchScripts(projectId: string, onChange: (l: Listing<RemoteScript>) => void): Unsubscribe {
    const w = { onChange };
    this.scriptWatchers.set(w, projectId);
    this.deliver(this.scriptWatchers, w, this.listing(this.scripts.get(projectId)));
    return () => this.scriptWatchers.delete(w);
  }

  watchDrafts(projectId: string, onChange: (l: Listing<RemoteDraft>) => void): Unsubscribe {
    const w = { onChange };
    this.draftWatchers.set(w, projectId);
    this.deliver(this.draftWatchers, w, this.listing(this.drafts.get(projectId)));
    return () => this.draftWatchers.delete(w);
  }

  async putProject(uid: string, project: Project, expectedRev: number | null): Promise<PutResult<RemoteProject>> {
    this.check();
    const current = this.projects.get(project.id) ?? null;
    if ((current?.rev ?? null) !== expectedRev) return { ok: false, current: current ? structuredClone(current) : null };
    if (current && !current.memberIds.includes(uid)) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const rev = (current?.rev ?? 0) + 1;
    this.projects.set(project.id, {
      project: structuredClone(project),
      rev,
      ownerId: current?.ownerId ?? uid,
      memberIds: current?.memberIds ?? [uid],
    });
    this.writes++;
    this.notify();
    return { ok: true, rev };
  }

  async putScript(uid: string, projectId: string, script: Script, expectedRev: number | null): Promise<PutResult<RemoteScript>> {
    this.check();
    this.assertMember(uid, projectId);
    const col = this.scripts.get(projectId) ?? new Map<string, RemoteScript>();
    this.scripts.set(projectId, col);
    const current = col.get(script.id) ?? null;
    if ((current?.rev ?? null) !== expectedRev) return { ok: false, current: current ? structuredClone(current) : null };
    const rev = (current?.rev ?? 0) + 1;
    col.set(script.id, { script: structuredClone({ ...script, projectId }), rev });
    this.writes++;
    this.notify();
    return { ok: true, rev };
  }

  async putDraft(uid: string, projectId: string, draft: Draft): Promise<number> {
    this.check();
    this.assertMember(uid, projectId);
    const col = this.drafts.get(projectId) ?? new Map<string, RemoteDraft>();
    this.drafts.set(projectId, col);
    const rev = (col.get(draft.id)?.rev ?? 0) + 1;
    col.set(draft.id, { draft: structuredClone(draft), rev });
    this.writes++;
    this.notify();
    return rev;
  }

  private assertMember(uid: string, projectId: string) {
    if (!this.projects.get(projectId)?.memberIds.includes(uid)) {
      throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    }
  }

  async deleteProject(projectId: string) {
    this.check();
    this.projects.delete(projectId);
    this.scripts.delete(projectId);
    this.drafts.delete(projectId);
    this.notify();
  }

  async deleteScript(projectId: string, scriptId: string) {
    this.check();
    this.scripts.get(projectId)?.delete(scriptId);
    this.notify();
  }

  async deleteDraft(projectId: string, draftId: string) {
    this.check();
    this.drafts.get(projectId)?.delete(draftId);
    this.notify();
  }
}
