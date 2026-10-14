// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createDraft, createProject, createScript } from '../core/script';
import { textElement } from '../core/types';
import { memoryLibrary, openLibrary } from './library';

describe('library', () => {
  it('groups scripts into projects and keeps drafts per script', async () => {
    const lib = memoryLibrary();
    const project = createProject('Paper Trail');
    await lib.saveProject(project);
    const pilot = createScript({ title: 'PAPER TRAIL', projectId: project.id });
    pilot.elements = [textElement('character', 'DANA'), textElement('dialogue', 'Hi.'), textElement('character', 'JAK'), textElement('dialogue', '')];
    const other = createScript({ title: 'SOMETHING ELSE' });
    other.elements = [textElement('character', 'ZED'), textElement('dialogue', 'Yo.')];
    await lib.save(pilot);
    await lib.save(other);
    const d1 = createDraft(pilot, { name: 'First Draft' });
    await lib.saveDraft(d1);
    await lib.saveDraft({ ...createDraft(pilot, { name: 'Draft 2' }), createdAt: d1.createdAt + 1 });

    const list = await lib.list();
    expect(list.find((s) => s.id === pilot.id)).toMatchObject({ projectId: project.id, drafts: 2 });
    expect((await lib.listDrafts(pilot.id)).map((d) => d.name)).toEqual(['Draft 2', 'First Draft']);

    // The cast is shared within a project only, and only characters who speak count.
    expect(await lib.cast({ projectId: project.id })).toEqual({ DANA: 1 });
    expect(await lib.cast({ projectId: project.id, excludeId: pilot.id })).toEqual({});
    expect(await lib.cast({ projectId: null })).toEqual({});

    // Deleting a project keeps its scripts, unfiled.
    await lib.removeProject(project.id);
    expect((await lib.load(pilot.id))!.projectId).toBeNull();

    // Deleting a script deletes its drafts.
    await lib.remove(pilot.id);
    expect(await lib.listDrafts(pilot.id)).toEqual([]);
  });

  it('upgrades a version 1 database in place', async () => {
    const v1 = await openDB('punchline', 1, {
      upgrade(db) {
        db.createObjectStore('scripts', { keyPath: 'id' });
        db.createObjectStore('prefs');
      },
    });
    const old = { ...createScript({ title: 'OLD ONE' }), schemaVersion: 1 } as Record<string, unknown>;
    delete old.projectId;
    await v1.put('scripts', old);
    await v1.put('prefs', old.id, 'lastScriptId');
    v1.close();

    const lib = await openLibrary();
    expect(lib.persistent).toBe(true);
    const loaded = await lib.load(old.id as string);
    expect(loaded).toMatchObject({ schemaVersion: 2, projectId: null, titlePage: { title: 'OLD ONE' } });
    expect(await lib.getPref('lastScriptId')).toBe(old.id);
    const project = createProject('New Show');
    await lib.saveProject(project);
    await lib.saveDraft(createDraft(loaded!, { name: 'First Draft' }));
    expect(await lib.listProjects()).toEqual([project]);
    expect((await lib.listDrafts(old.id as string)).length).toBe(1);
  });
});
