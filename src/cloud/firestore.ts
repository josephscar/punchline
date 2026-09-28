import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import { sanitizeDraft, sanitizeProject, sanitizeScript } from '../core/script';
import type { Draft, Project, Script } from '../core/types';
import type { FirebaseConfig } from './config';
import type { CloudBackend, CloudUser, Listing, PutResult, RemoteDraft, RemoteProject, RemoteScript, Unsubscribe } from './types';

/**
 * Firestore implementation of CloudBackend. Layout (see firestore.rules):
 *
 *   projects/{projectId}                title, formatId, ownerId, memberIds, rev
 *   projects/{projectId}/scripts/{id}   body (script JSON), title, rev
 *   projects/{projectId}/drafts/{id}    body (draft JSON), scriptId, rev
 *
 * Scripts and drafts are stored as JSON strings: one field per document
 * keeps them far below Firestore's per-document field and index limits.
 */

export interface FirebaseConnection {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export function connectFirebase(config: FirebaseConfig, options: { emulator?: boolean; name?: string } = {}): FirebaseConnection {
  const app = initializeApp(config, options.name);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (options.emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { app, auth, db };
}

export function toCloudUser(user: User): CloudUser {
  return {
    uid: user.uid,
    name: user.displayName ?? user.email ?? 'Signed in',
    email: user.email ?? '',
    photoUrl: user.photoURL,
  };
}

export function watchUser(conn: FirebaseConnection, onChange: (user: CloudUser | null) => void): Unsubscribe {
  return onAuthStateChanged(conn.auth, (u) => onChange(u ? toCloudUser(u) : null));
}

export async function signInWithGoogle(conn: FirebaseConnection): Promise<CloudUser> {
  const result = await signInWithPopup(conn.auth, new GoogleAuthProvider());
  return toCloudUser(result.user);
}

export function signOutOfCloud(conn: FirebaseConnection): Promise<void> {
  return signOut(conn.auth);
}

function listing<T>(snap: QuerySnapshot<DocumentData>, read: (data: DocumentData) => T | null): Listing<T> {
  const items: T[] = [];
  for (const d of snap.docs) {
    try {
      const item = read(d.data());
      if (item) items.push(item);
    } catch {
      // A damaged document shouldn't stop the rest from syncing.
    }
  }
  // Pending local writes are ours; only a server-confirmed listing may be used to detect deletions.
  return { items, fromServer: !snap.metadata.fromCache };
}

export function firestoreBackend(conn: FirebaseConnection): CloudBackend {
  const { db } = conn;
  const projectRef = (id: string) => doc(db, 'projects', id);
  const scriptRef = (projectId: string, id: string) => doc(db, 'projects', projectId, 'scripts', id);
  const draftRef = (projectId: string, id: string) => doc(db, 'projects', projectId, 'drafts', id);

  const readProject = (data: DocumentData): RemoteProject => ({
    project: sanitizeProject({
      id: data.id,
      title: data.title,
      formatId: data.formatId,
      createdAt: data.createdAt,
      updatedAt: data.clientUpdatedAt,
    }),
    rev: data.rev,
    ownerId: data.ownerId,
    memberIds: data.memberIds ?? [],
  });
  const readScript = (data: DocumentData): RemoteScript => ({ script: sanitizeScript(JSON.parse(data.body)), rev: data.rev });
  const readDraft = (data: DocumentData): RemoteDraft => ({ draft: sanitizeDraft(JSON.parse(data.body)), rev: data.rev });

  return {
    watchProjects(uid, onChange, onError) {
      const q = query(collection(db, 'projects'), where('memberIds', 'array-contains', uid));
      return onSnapshot(q, (snap) => onChange(listing(snap, readProject)), onError);
    },

    watchScripts(projectId, onChange, onError) {
      return onSnapshot(collection(db, 'projects', projectId, 'scripts'), (snap) => onChange(listing(snap, readScript)), onError);
    },

    watchDrafts(projectId, onChange, onError) {
      return onSnapshot(collection(db, 'projects', projectId, 'drafts'), (snap) => onChange(listing(snap, readDraft)), onError);
    },

    async putProject(uid: string, project: Project, expectedRev: number | null): Promise<PutResult<RemoteProject>> {
      const ref = projectRef(project.id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists() ? readProject(snap.data()) : null;
        if ((current?.rev ?? null) !== expectedRev) return { ok: false as const, current };
        const rev = (current?.rev ?? 0) + 1;
        const fields = {
          id: project.id,
          title: project.title,
          formatId: project.formatId,
          createdAt: project.createdAt,
          clientUpdatedAt: project.updatedAt,
          rev,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        };
        if (current) tx.update(ref, fields);
        else tx.set(ref, { ...fields, ownerId: uid, memberIds: [uid] });
        return { ok: true as const, rev };
      });
    },

    async putScript(uid: string, projectId: string, script: Script, expectedRev: number | null): Promise<PutResult<RemoteScript>> {
      const ref = scriptRef(projectId, script.id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists() ? readScript(snap.data()) : null;
        if ((current?.rev ?? null) !== expectedRev) return { ok: false as const, current };
        const rev = (current?.rev ?? 0) + 1;
        tx.set(ref, {
          body: JSON.stringify({ ...script, projectId }),
          title: script.titlePage.title,
          rev,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
        return { ok: true as const, rev };
      });
    },

    async putDraft(uid: string, projectId: string, draft: Draft): Promise<number> {
      // Drafts never change once saved, so there's nothing to conflict with.
      await setDoc(draftRef(projectId, draft.id), {
        body: JSON.stringify(draft),
        scriptId: draft.scriptId,
        rev: 1,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      return 1;
    },

    async deleteProject(projectId: string) {
      // Firestore doesn't delete sub-collections with their parent: empty them first,
      // while we're still a member and allowed to.
      for (const sub of ['drafts', 'scripts']) {
        const docs = (await getDocs(collection(db, 'projects', projectId, sub))).docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
          await batch.commit();
        }
      }
      await deleteDoc(projectRef(projectId));
    },

    async deleteScript(projectId: string, scriptId: string) {
      await deleteDoc(scriptRef(projectId, scriptId));
    },

    async deleteDraft(projectId: string, draftId: string) {
      await deleteDoc(draftRef(projectId, draftId));
    },
  };
}
