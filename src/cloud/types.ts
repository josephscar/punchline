import type { Draft, Project, Script } from '../core/types';

/**
 * The cloud as the sync engine sees it. Firestore implements this in
 * production; an in-memory fake implements it in tests.
 *
 * Every project, script and draft carries a revision number (`rev`) that the
 * server increments on each write. Writes say which revision they were based
 * on, so a device can never silently overwrite changes it hasn't seen.
 */

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
  photoUrl: string | null;
}

export interface RemoteProject {
  project: Project;
  rev: number;
  ownerId: string;
  memberIds: string[];
}

export interface RemoteScript {
  /** Script as stored in the cloud; its projectId is the project it lives under. */
  script: Script;
  rev: number;
}

export interface RemoteDraft {
  draft: Draft;
  rev: number;
}

/** A full listing of a collection, and whether it's confirmed by the server (not just a cache). */
export interface Listing<T> {
  items: T[];
  fromServer: boolean;
}

export type PutResult<T> = { ok: true; rev: number } | { ok: false; current: T | null };

export type Unsubscribe = () => void;

export interface CloudBackend {
  /** Projects the user is a member of, now and whenever they change. */
  watchProjects(uid: string, onChange: (listing: Listing<RemoteProject>) => void, onError: (e: unknown) => void): Unsubscribe;
  watchScripts(projectId: string, onChange: (listing: Listing<RemoteScript>) => void, onError: (e: unknown) => void): Unsubscribe;
  watchDrafts(projectId: string, onChange: (listing: Listing<RemoteDraft>) => void, onError: (e: unknown) => void): Unsubscribe;

  /** Create (expectedRev null) or update (expectedRev = last rev seen). Fails with the current version on a mismatch. */
  putProject(uid: string, project: Project, expectedRev: number | null): Promise<PutResult<RemoteProject>>;
  /**
   * Like putProject. `recreateAfter`: when putting back a script that was
   * deleted from the cloud, continue numbering after the revision this device
   * last had, so revisions never go backwards for devices that still have it.
   */
  putScript(uid: string, projectId: string, script: Script, expectedRev: number | null, recreateAfter?: number): Promise<PutResult<RemoteScript>>;
  putDraft(uid: string, projectId: string, draft: Draft): Promise<number>;

  /** Deletes the project and everything in it. */
  deleteProject(projectId: string): Promise<void>;
  deleteScript(projectId: string, scriptId: string): Promise<void>;
  deleteDraft(projectId: string, draftId: string): Promise<void>;
}

export type SyncStatus = 'off' | 'signed-out' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';

/** What this device last synced for one record. */
export interface SyncMeta {
  /** `${type}:${id}` */
  key: string;
  type: 'project' | 'script' | 'draft';
  id: string;
  /** Cloud project the record lives under (a project's own id for projects). */
  projectId: string;
  /** Server revision last uploaded or downloaded. */
  rev: number;
  /** Content hash at that revision; the local copy has unsynced edits when its hash differs. */
  hash: string;
  /** Deleted on this device; the cloud copy is still to be deleted. */
  deleted?: boolean;
}

export const metaKey = (type: SyncMeta['type'], id: string) => `${type}:${id}`;
