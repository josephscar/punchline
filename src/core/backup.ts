import { sanitizeDraft, sanitizeProject, sanitizeScript } from './script';
import { newId, type Draft, type Project, type Script } from './types';

/**
 * Punchline's own file format (`.punchline`): JSON with a small envelope.
 *
 *   { app: "punchline", kind: "script",  version: 2, script, drafts }
 *   { app: "punchline", kind: "project", version: 2, project, scripts, drafts }
 *
 * Version 1 files (a script without drafts) still import.
 */

export type Backup =
  | { kind: 'script'; script: Script; drafts: Draft[] }
  | { kind: 'project'; project: Project; scripts: Script[]; drafts: Draft[] };

export function serializeScriptBackup(script: Script, drafts: Draft[] = []): string {
  return JSON.stringify({ app: 'punchline', kind: 'script', version: 2, script, drafts }, null, 2);
}

export function serializeProjectBackup(project: Project, scripts: Script[], drafts: Draft[]): string {
  return JSON.stringify({ app: 'punchline', kind: 'project', version: 2, project, scripts, drafts }, null, 2);
}

function draftsOf(input: unknown, scriptIds: Set<string>): Draft[] {
  if (!Array.isArray(input)) return [];
  const drafts: Draft[] = [];
  for (const raw of input) {
    try {
      const d = sanitizeDraft(raw);
      if (scriptIds.has(d.scriptId)) drafts.push(d);
    } catch {
      // Skip damaged drafts rather than refusing the whole file.
    }
  }
  return drafts;
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  const env = (data ?? {}) as Record<string, unknown>;
  if (env.app === 'punchline' && env.kind === 'project') {
    const project = sanitizeProject(env.project);
    const scripts = (Array.isArray(env.scripts) ? env.scripts : []).map((s) => ({ ...sanitizeScript(s), projectId: project.id }));
    return { kind: 'project', project, scripts, drafts: draftsOf(env.drafts, new Set(scripts.map((s) => s.id))) };
  }
  const script = sanitizeScript(env.app === 'punchline' ? env.script : data);
  return { kind: 'script', script, drafts: draftsOf(env.drafts, new Set([script.id])) };
}

/**
 * Give everything in a backup new ids, so importing a file never overwrites
 * work already in the library (even when the same file is imported twice).
 * Drafts follow their script, and revision marks follow their draft.
 */
export function withFreshIds(backup: Backup, projectId: string | null = null): Backup {
  const scriptIds = new Map<string, string>();
  const draftIds = new Map<string, string>();
  const newProjectId = backup.kind === 'project' ? newId() : projectId;
  const scripts = backup.kind === 'project' ? backup.scripts : [backup.script];
  for (const s of scripts) scriptIds.set(s.id, newId());
  for (const d of backup.drafts) draftIds.set(d.id, newId());
  const now = Date.now();
  const fresh = scripts.map((s) => ({
    ...s,
    id: scriptIds.get(s.id)!,
    projectId: newProjectId,
    settings: { ...s.settings, revisionBaseline: s.settings.revisionBaseline ? (draftIds.get(s.settings.revisionBaseline) ?? null) : null },
    updatedAt: now,
  }));
  const drafts = backup.drafts.map((d) => ({ ...d, id: draftIds.get(d.id)!, scriptId: scriptIds.get(d.scriptId)! }));
  if (backup.kind === 'project') {
    return { kind: 'project', project: { ...backup.project, id: newProjectId!, updatedAt: now }, scripts: fresh, drafts };
  }
  return { kind: 'script', script: fresh[0], drafts };
}
