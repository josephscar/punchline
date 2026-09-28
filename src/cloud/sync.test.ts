import { describe, expect, it } from 'vitest';
import { createDraft, createProject, createScript } from '../core/script';
import { plainText, textElement, type Script } from '../core/types';
import { memoryLibrary } from '../storage/library';
import { FakeCloud } from './fake';
import { SyncEngine, SyncedLibrary } from './sync';
import type { CloudUser, SyncStatus } from './types';

const USER: CloudUser = { uid: 'user-1', name: 'Sam', email: 'sam@example.com', photoUrl: null };

/** One device: its own local library and sync engine, sharing the cloud. */
function device(cloud: FakeCloud, user = USER) {
  const base = memoryLibrary();
  const lib = new SyncedLibrary(base);
  const d = {
    base,
    lib,
    cloud,
    notices: [] as string[],
    status: 'off' as SyncStatus,
    busy: new Set<string>(),
    engine: null as unknown as SyncEngine,
    async start() {
      d.engine = new SyncEngine(
        base,
        cloud,
        user,
        {
          onRemoteChange: () => undefined,
          onStatus: (s) => (d.status = s),
          onNotice: (m) => d.notices.push(m),
          canApply: (id) => !d.busy.has(id),
        },
        { pushDelay: 0, retryDelay: 5, deferDelay: 5 },
      );
      lib.engine = d.engine;
      await d.engine.start();
    },
    stop() {
      d.engine.stop();
      lib.engine = null;
    },
  };
  return d;
}

type Device = ReturnType<typeof device>;

/** Let uploads, listeners and retries run until everything settles. */
async function settle(...devices: Device[]) {
  for (let round = 0; round < 8; round++) {
    await new Promise((r) => setTimeout(r, 15));
    for (const d of devices) if (d.lib.engine) await d.engine.idle();
  }
}

const text = (s: Script | undefined) => s?.elements.map(plainText).join(' | ');

async function seed(d: Device) {
  const project = createProject('Paper Trail');
  await d.lib.saveProject(project);
  const pilot = createScript({ title: 'PAPER TRAIL', projectId: project.id, blank: true });
  pilot.elements = [textElement('scene_heading', 'INT. OFFICE - DAY'), textElement('action', 'Dana tapes a banner.')];
  await d.lib.save(pilot);
  const draft = createDraft(pilot, { name: 'First Draft' });
  await d.lib.saveDraft(draft);
  const loose = createScript({ title: 'LOCAL ONLY', blank: true });
  await d.lib.save(loose);
  return { project, pilot, draft, loose };
}

async function edit(d: Device, id: string, action: string) {
  const s = (await d.lib.load(id))!;
  await d.lib.save({ ...s, elements: [s.elements[0], textElement('action', action)], updatedAt: Date.now() });
}

describe('cloud sync', () => {
  it('uploads projects with their scripts and drafts; scripts outside projects stay on the device', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const { project, pilot, draft, loose } = await seed(a);
    await a.start();
    await settle(a);
    expect(cloud.projects.get(project.id)?.project.title).toBe('Paper Trail');
    expect(cloud.projects.get(project.id)?.memberIds).toEqual([USER.uid]);
    expect(text(cloud.scripts.get(project.id)?.get(pilot.id)?.script)).toBe('INT. OFFICE - DAY | Dana tapes a banner.');
    expect(cloud.drafts.get(project.id)?.has(draft.id)).toBe(true);
    expect(Array.from(cloud.scripts.values()).some((c) => c.has(loose.id))).toBe(false);
    expect(a.status).toBe('synced');
  });

  it('downloads everything on another device, and edits flow both ways without echoing', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { project, pilot, draft } = await seed(a);
    await a.start();
    await b.start();
    await settle(a, b);
    expect((await b.lib.listProjects()).map((p) => p.title)).toEqual(['Paper Trail']);
    expect(text(await b.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Dana tapes a banner.');
    expect((await b.lib.load(pilot.id))?.projectId).toBe(project.id);
    expect((await b.lib.listDrafts(pilot.id)).map((d) => d.id)).toEqual([draft.id]);

    const writes = cloud.writes;
    await edit(a, pilot.id, 'Dana tapes a HUGE banner.');
    await settle(a, b);
    expect(text(await b.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Dana tapes a HUGE banner.');
    // One upload from A; B applying it doesn't upload it again.
    expect(cloud.writes).toBe(writes + 1);

    await edit(b, pilot.id, 'Gary rolls his eyes.');
    await settle(a, b);
    expect(text(await a.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Gary rolls his eyes.');
    expect(a.notices).toEqual([]);
  });

  it('keeps both versions when a script was changed on two devices before syncing', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { pilot } = await seed(a);
    await a.start();
    await b.start();
    await settle(a, b);

    b.stop(); // B goes offline
    await edit(a, pilot.id, 'Version from the laptop.');
    await settle(a);
    await edit(b, pilot.id, 'Version from the desktop.');
    await b.start(); // B comes back
    await settle(a, b);

    // The device that syncs last keeps its pages; the other version becomes a draft.
    expect(text(cloud.scripts.get(pilot.projectId!)?.get(pilot.id)?.script)).toBe('INT. OFFICE - DAY | Version from the desktop.');
    for (const d of [a, b]) {
      expect(text(await d.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Version from the desktop.');
      const saved = (await d.lib.listDrafts(pilot.id)).find((x) => x.name === 'From another device');
      expect(saved && text({ elements: saved.elements } as Script)).toBe('INT. OFFICE - DAY | Version from the laptop.');
    }
    expect(b.notices[0]).toMatch(/also changed on another device/);
  });

  it('waits while a script is being edited before applying changes from elsewhere', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { pilot } = await seed(a);
    await a.start();
    await b.start();
    await settle(a, b);
    b.busy.add(pilot.id);
    await edit(a, pilot.id, 'Changed while B types.');
    await settle(a, b);
    expect(text(await b.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Dana tapes a banner.');
    b.busy.clear();
    await settle(a, b);
    expect(text(await b.lib.load(pilot.id))).toBe('INT. OFFICE - DAY | Changed while B types.');
  });

  it('deletes scripts and drafts everywhere', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { pilot, draft } = await seed(a);
    const second = createDraft(pilot, { name: 'Draft 2' });
    await a.lib.saveDraft(second);
    await a.start();
    await b.start();
    await settle(a, b);
    await a.lib.removeDraft(draft.id);
    await settle(a, b);
    expect((await b.lib.listDrafts(pilot.id)).map((d) => d.name)).toEqual(['Draft 2']);
    await a.lib.remove(pilot.id);
    await settle(a, b);
    expect(cloud.scripts.get(pilot.projectId!)?.has(pilot.id)).toBe(false);
    expect(await b.lib.load(pilot.id)).toBeUndefined();
    expect(await b.lib.listDrafts(pilot.id)).toEqual([]);
  });

  it('deleting a project keeps its scripts on every device, outside any project', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { project, pilot } = await seed(a);
    await a.start();
    await b.start();
    await settle(a, b);
    await a.lib.removeProject(project.id);
    await settle(a, b);
    expect(cloud.projects.has(project.id)).toBe(false);
    expect(await b.lib.listProjects()).toEqual([]);
    for (const d of [a, b]) expect((await d.lib.load(pilot.id))?.projectId).toBeNull();
    // Unfiled now, so later edits stay local.
    const writes = cloud.writes;
    await edit(a, pilot.id, 'Local now.');
    await settle(a, b);
    expect(cloud.writes).toBe(writes);
  });

  it('moves scripts between projects, and out of the cloud when taken out of a project', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const b = device(cloud);
    const { project, pilot } = await seed(a);
    const other = createProject('Other Show');
    await a.lib.saveProject(other);
    await a.start();
    await b.start();
    await settle(a, b);

    await a.lib.save({ ...(await a.lib.load(pilot.id))!, projectId: other.id });
    await settle(a, b);
    expect(cloud.scripts.get(project.id)?.has(pilot.id)).toBe(false);
    expect(cloud.scripts.get(other.id)?.has(pilot.id)).toBe(true);
    expect((await b.lib.load(pilot.id))?.projectId).toBe(other.id);
    expect((await b.lib.listDrafts(pilot.id)).length).toBe(1);

    await a.lib.save({ ...(await a.lib.load(pilot.id))!, projectId: null });
    await settle(a, b);
    expect(cloud.scripts.get(other.id)?.has(pilot.id)).toBe(false);
    expect(await a.lib.load(pilot.id)).toBeDefined(); // still on the device that moved it
  });

  it('retries uploads after being offline', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const { pilot } = await seed(a);
    await a.start();
    await settle(a);
    cloud.offline = true;
    await edit(a, pilot.id, 'Written on a plane.');
    await settle(a);
    expect(a.status).toBe('offline');
    cloud.offline = false;
    await settle(a);
    await new Promise((r) => setTimeout(r, 60));
    await settle(a);
    expect(text(cloud.scripts.get(pilot.projectId!)?.get(pilot.id)?.script)).toBe('INT. OFFICE - DAY | Written on a plane.');
    expect(a.status).toBe('synced');
  });

  it('never deletes new uploads because of a listing that was already out of date when it arrived', async () => {
    const cloud = new FakeCloud();
    cloud.lag = 20; // listings show the cloud as it was 20ms earlier
    const a = device(cloud);
    const { project, pilot, draft } = await seed(a);
    await a.start();
    await settle(a);
    await new Promise((r) => setTimeout(r, 60));
    await settle(a);
    expect((await a.lib.listProjects()).map((p) => p.id)).toEqual([project.id]);
    expect((await a.lib.load(pilot.id))?.projectId).toBe(project.id);
    expect((await a.lib.listDrafts(pilot.id)).map((d) => d.id)).toEqual([draft.id]);

    // Deleted elsewhere later on: that does reach this device.
    await cloud.deleteScript(project.id, pilot.id);
    await new Promise((r) => setTimeout(r, 60));
    await settle(a);
    expect(await a.lib.load(pilot.id)).toBeUndefined();
  });

  it('never deletes local work because of a cached, empty listing', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const { project, pilot } = await seed(a);
    await a.start();
    await settle(a);
    a.stop();
    cloud.cacheOnly = true;
    await a.start();
    await settle(a);
    expect((await a.lib.listProjects()).map((p) => p.id)).toEqual([project.id]);
    expect(await a.lib.load(pilot.id)).toBeDefined();
  });

  it('uploads work done while signed out', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud);
    const { pilot } = await seed(a);
    await a.start();
    await settle(a);
    a.stop();
    await edit(a, pilot.id, 'Written while signed out.');
    await a.lib.saveDraft(createDraft((await a.lib.load(pilot.id))!, { name: 'Offline draft' }));
    await a.start();
    await settle(a);
    expect(text(cloud.scripts.get(pilot.projectId!)?.get(pilot.id)?.script)).toBe('INT. OFFICE - DAY | Written while signed out.');
    expect(Array.from(cloud.drafts.get(pilot.projectId!)?.values() ?? []).map((d) => d.draft.name).sort()).toEqual(['First Draft', 'Offline draft']);
  });
});
