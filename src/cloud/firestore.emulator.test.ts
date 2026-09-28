// Runs against the Firebase emulators: `npm run test:cloud`.
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDraft, createProject, createScript } from '../core/script';
import { plainText, textElement } from '../core/types';
import { memoryLibrary } from '../storage/library';
import { EMULATOR_CONFIG } from './config';
import { connectFirebase, firestoreBackend, toCloudUser, type FirebaseConnection } from './firestore';
import { SyncEngine, SyncedLibrary } from './sync';

const PROJECT = EMULATOR_CONFIG.projectId;
let appCount = 0;
const connections: FirebaseConnection[] = [];

async function reset() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** A signed-in "device": its own Firebase app instance. */
async function signedIn(email: string, create: boolean) {
  const conn = connectFirebase(EMULATOR_CONFIG, { emulator: true, name: `device-${++appCount}` });
  connections.push(conn);
  const cred = create
    ? await createUserWithEmailAndPassword(conn.auth, email, 'password123')
    : await signInWithEmailAndPassword(conn.auth, email, 'password123');
  return { conn, user: toCloudUser(cred.user), backend: firestoreBackend(conn) };
}

async function device(email: string, create: boolean) {
  const cloud = await signedIn(email, create);
  const base = memoryLibrary();
  const lib = new SyncedLibrary(base);
  const notices: string[] = [];
  const statuses: string[] = [];
  const engine = new SyncEngine(
    base,
    cloud.backend,
    cloud.user,
    {
      onRemoteChange: () => undefined,
      onStatus: (st, detail) => statuses.push(detail ? `${st}: ${detail}` : st),
      onNotice: (m) => notices.push(m),
      canApply: () => true,
    },
    { pushDelay: 0, retryDelay: 50, deferDelay: 50 },
  );
  lib.engine = engine;
  return { ...cloud, base, lib, engine, notices, statuses };
}

/** Wait until `check` passes (Firestore listeners are asynchronous). */
async function eventually(check: () => Promise<boolean>, what: string | (() => string)) {
  let last: unknown = null;
  for (let i = 0; i < 100; i++) {
    try {
      if (await check()) return;
    } catch (e) {
      last = e; // e.g. not readable yet because the upload hasn't happened
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const label = typeof what === 'string' ? what : what();
  throw new Error(`Timed out waiting for: ${label}${last ? ` (last error: ${last})` : ''}`);
}

beforeEach(reset);
afterEach(async () => {
  for (const c of connections.splice(0)) {
    await c.auth.signOut().catch(() => undefined);
  }
});

describe('Firestore backend (emulator)', () => {
  it('syncs a project between two devices signed in to the same account', async () => {
    const a = await device('sam@example.com', true);
    const b = await device('sam@example.com', false);
    expect(b.user.uid).toBe(a.user.uid);

    const project = createProject('Paper Trail');
    await a.lib.saveProject(project);
    const pilot = createScript({ title: 'PAPER TRAIL', projectId: project.id, blank: true });
    pilot.elements = [textElement('scene_heading', 'INT. OFFICE - DAY'), textElement('action', 'Dana tapes a banner.')];
    await a.lib.save(pilot);
    await a.lib.saveDraft(createDraft(pilot, { name: 'First Draft', color: 'White' }));

    await a.engine.start();
    await b.engine.start();
    await eventually(async () => (await b.lib.load(pilot.id)) !== undefined, 'B downloads the pilot');
    await eventually(async () => (await b.lib.listDrafts(pilot.id)).length === 1, 'B downloads the draft');
    expect((await b.lib.listProjects()).map((p) => p.title)).toEqual(['Paper Trail']);

    // Stored as a JSON body plus revision, with the owner as the only member.
    const stored = await getDoc(doc(a.conn.db, 'projects', project.id));
    expect(stored.data()).toMatchObject({ title: 'Paper Trail', ownerId: a.user.uid, memberIds: [a.user.uid], rev: 1 });

    // An edit on B arrives on A.
    const onB = (await b.lib.load(pilot.id))!;
    await b.lib.save({ ...onB, elements: [onB.elements[0], textElement('action', 'Gary rolls his eyes.')] });
    await eventually(
      async () => plainText((await a.lib.load(pilot.id))!.elements[1]) === 'Gary rolls his eyes.',
      () => `A receives B’s edit (A: ${a.statuses.join(', ')}; B: ${b.statuses.join(', ')})`,
    );

    a.engine.stop();
    b.engine.stop();
  });

  it('keeps both versions when two devices edit the same script', async () => {
    const a = await device('sam@example.com', true);
    const b = await device('sam@example.com', false);
    const project = createProject('Paper Trail');
    await a.lib.saveProject(project);
    const pilot = createScript({ title: 'PAPER TRAIL', projectId: project.id, blank: true });
    await a.lib.save(pilot);
    await a.engine.start();
    await b.engine.start();
    await eventually(async () => (await b.lib.load(pilot.id)) !== undefined, 'B downloads the pilot');

    b.engine.stop();
    await a.lib.save({ ...pilot, elements: [textElement('action', 'From the laptop.')] });
    await eventually(async () => {
      const remote = await getDoc(doc(a.conn.db, 'projects', project.id, 'scripts', pilot.id));
      return remote.data()?.rev === 2;
    }, 'A uploads its edit');
    await b.lib.save({ ...(await b.lib.load(pilot.id))!, elements: [textElement('action', 'From the desktop.')] });
    await b.engine.start();

    await eventually(async () => b.notices.length > 0, 'B notices the conflict');
    await eventually(
      async () => plainText((await a.lib.load(pilot.id))!.elements[0]) === 'From the desktop.',
      'A receives the version that synced last',
    );
    await eventually(async () => (await a.lib.listDrafts(pilot.id)).some((d) => d.name === 'From another device'), 'A receives the saved copy');
    const saved = (await b.lib.listDrafts(pilot.id)).find((d) => d.name === 'From another device')!;
    expect(plainText(saved.elements[0])).toBe('From the laptop.');
    a.engine.stop();
    b.engine.stop();
  });

  it('deleting a project removes it and everything in it from the cloud', async () => {
    const a = await device('sam@example.com', true);
    const project = createProject('Paper Trail');
    await a.lib.saveProject(project);
    const pilot = createScript({ projectId: project.id, blank: true });
    await a.lib.save(pilot);
    await a.lib.saveDraft(createDraft(pilot, { name: 'First Draft' }));
    await a.engine.start();
    await eventually(async () => (await getDocs(collection(a.conn.db, 'projects', project.id, 'drafts'))).size === 1, 'upload');
    await a.lib.removeProject(project.id);
    await eventually(async () => !(await getDoc(doc(a.conn.db, 'projects', project.id))).exists(), 'project deleted');
    // Check the sub-collections directly on the emulator (the rules no longer let us read them).
    const res = await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/projects/${project.id}/scripts`,
      { headers: { Authorization: 'Bearer owner' } },
    );
    expect(((await res.json()) as { documents?: unknown[] }).documents ?? []).toEqual([]);
    expect((await a.lib.load(pilot.id))?.projectId).toBeNull();
    a.engine.stop();
  });
});

describe('security rules (emulator)', () => {
  it('keeps projects private to their members', async () => {
    const owner = await signedIn('owner@example.com', true);
    const stranger = await signedIn('stranger@example.com', true);
    const project = createProject('Secret Show');
    const put = await owner.backend.putProject(owner.user.uid, project, null);
    expect(put.ok).toBe(true);
    const script = createScript({ projectId: project.id, blank: true });
    expect((await owner.backend.putScript(owner.user.uid, project.id, script, null)).ok).toBe(true);

    const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'permission-denied' });
    await denied(getDoc(doc(stranger.conn.db, 'projects', project.id)));
    await denied(getDoc(doc(stranger.conn.db, 'projects', project.id, 'scripts', script.id)));
    await denied(stranger.backend.putScript(stranger.user.uid, project.id, script, 1));
    await denied(setDoc(doc(stranger.conn.db, 'projects', project.id, 'drafts', 'x'), { body: '{}' }));
    // Can't make yourself a member, or create a project in someone else's name.
    await denied(updateDoc(doc(stranger.conn.db, 'projects', project.id), { memberIds: [owner.user.uid, stranger.user.uid] }));
    await denied(setDoc(doc(stranger.conn.db, 'projects', 'fake'), { ownerId: owner.user.uid, memberIds: [owner.user.uid] }));
    // The stranger's own listing is empty.
    const theirs = await new Promise<number>((resolve) => {
      const stop = stranger.backend.watchProjects(stranger.user.uid, (l) => {
        if (l.fromServer) {
          stop();
          resolve(l.items.length);
        }
      }, () => resolve(-1));
    });
    expect(theirs).toBe(0);
  });

  it('lets the owner share a project, and members work in it but not change who’s in it', async () => {
    const owner = await signedIn('owner@example.com', true);
    const writer = await signedIn('writer@example.com', true);
    const outsider = await signedIn('outsider@example.com', true);
    const project = createProject('Writers Room');
    await owner.backend.putProject(owner.user.uid, project, null);
    // Sharing = the owner adds the co-writer's user id (v3 has no invite screen yet).
    await updateDoc(doc(owner.conn.db, 'projects', project.id), { memberIds: [owner.user.uid, writer.user.uid] });

    const script = createScript({ projectId: project.id, blank: true });
    expect((await writer.backend.putScript(writer.user.uid, project.id, script, null)).ok).toBe(true);
    const renamed = await writer.backend.putProject(writer.user.uid, { ...project, title: 'Writers Room (S2)' }, 1);
    expect(renamed.ok).toBe(true);
    await expect(
      updateDoc(doc(writer.conn.db, 'projects', project.id), { memberIds: [owner.user.uid, writer.user.uid, outsider.user.uid] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(writer.backend.deleteProject(project.id)).rejects.toMatchObject({ code: 'permission-denied' });
    // A member may leave.
    await updateDoc(doc(writer.conn.db, 'projects', project.id), { memberIds: [owner.user.uid] });
    await expect(getDoc(doc(writer.conn.db, 'projects', project.id, 'scripts', script.id))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
