import { describe, expect, it } from 'vitest';
import { parseBackup, serializeProjectBackup, serializeScriptBackup, withFreshIds } from './backup';
import { createDraft, createProject, createScript, suggestDraftName } from './script';
import { textElement } from './types';

describe('.punchline backups', () => {
  const script = createScript({ title: 'PAPER TRAIL' });
  const first = createDraft(script, { name: 'First Draft', color: 'White' });
  script.elements.push(textElement('action', 'A new line.'));
  script.settings.revisionBaseline = first.id;

  it('round-trips a script with its drafts', () => {
    const back = parseBackup(serializeScriptBackup(script, [first]));
    expect(back).toEqual({ kind: 'script', script, drafts: [first] });
  });

  it('still reads version 1 files and bare script objects', () => {
    const v1 = { ...script, schemaVersion: 1 } as Record<string, unknown>;
    delete v1.projectId;
    const fromV1 = parseBackup(JSON.stringify({ app: 'punchline', kind: 'script', version: 1, script: v1 }));
    expect(fromV1.kind === 'script' && fromV1.script.projectId).toBeNull();
    expect(parseBackup(JSON.stringify(v1)).kind).toBe('script');
    expect(() => parseBackup('not json')).toThrow(/JSON/);
  });

  it('round-trips a whole project', () => {
    const project = createProject('Paper Trail');
    const episode = { ...script, projectId: project.id };
    const back = parseBackup(serializeProjectBackup(project, [episode], [first]));
    expect(back).toEqual({ kind: 'project', project, scripts: [episode], drafts: [first] });
  });

  it('gives imports fresh ids, keeping drafts and revision marks attached', () => {
    const fresh = withFreshIds({ kind: 'script', script, drafts: [first] }, 'project-9');
    if (fresh.kind !== 'script') throw new Error('expected a script');
    expect(fresh.script.id).not.toBe(script.id);
    expect(fresh.script.projectId).toBe('project-9');
    expect(fresh.drafts[0].id).not.toBe(first.id);
    expect(fresh.drafts[0].scriptId).toBe(fresh.script.id);
    expect(fresh.script.settings.revisionBaseline).toBe(fresh.drafts[0].id);
  });

  it('suggests the next draft name and revision colour', () => {
    expect(suggestDraftName([])).toEqual({ name: 'First Draft', color: 'White' });
    expect(suggestDraftName([{ color: 'White' }])).toEqual({ name: 'Draft 2', color: 'Blue' });
  });
});
