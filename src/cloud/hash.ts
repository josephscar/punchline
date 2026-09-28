import { sanitizeDraft, sanitizeScript } from '../core/script';
import type { Draft, Project, Script } from '../core/types';

/** JSON with object keys sorted, so equal content always gives equal text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** cyrb53: a fast 53-bit string hash. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + str.length.toString(36);
}

/**
 * Hash of what a script says; timestamps and which project it sits in don't
 * count. It's taken of the script as it reads back from the cloud (sanitised),
 * so a script and its downloaded copy always hash the same.
 */
export function hashScript(script: Script): string {
  const { updatedAt: _u, createdAt: _c, projectId: _p, ...content } = sanitizeScript(script);
  return cyrb53(stableStringify(content));
}

export function hashProject(project: Project): string {
  return cyrb53(stableStringify({ title: project.title, formatId: project.formatId }));
}

export function hashDraft(draft: Draft): string {
  return cyrb53(stableStringify(sanitizeDraft(draft)));
}
