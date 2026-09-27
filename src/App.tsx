import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeScript, characterName } from './core/analysis';
import { nextInCycle } from './core/flow';
import { FORMATS, getFormat } from './core/formats';
import { serializeFdx } from './core/io/fdx';
import { serializeFountain } from './core/io/fountain';
import type { ScriptLayout } from './core/layout/paginate';
import { createSampleScript } from './core/sample';
import { endOfActIndex, moveScene } from './core/scenes';
import { serializeProjectBackup, serializeScriptBackup, type Backup } from './core/backup';
import { revisedIndices } from './core/diff';
import { createDraft, createProject, createScript, displayTitle, suggestDraftName } from './core/script';
import { rememberCharacters } from './core/suggestions';
import {
  newId,
  plainText,
  type Draft,
  type ElementKind,
  type Project,
  type RevisionColor,
  type Script,
  type ScriptElement,
  type ScriptSettings,
  type TitlePage,
} from './core/types';
import { ScriptEditor, type CursorInfo, type ScriptEditorHandle, type Shortcut } from './editor/ScriptEditor';
import { openLibrary, type Library, type ScriptSummary } from './storage/library';
import { CompareDialog, type Version } from './ui/CompareDialog';
import { RenameDialog, SettingsDialog, TitlePageDialog } from './ui/Dialogs';
import { DraftsPanel, formatDate } from './ui/DraftsPanel';
import { downloadBlob, downloadText, IMPORT_ACCEPT, importFile, loadPdfFonts, pickFile, safeFilename } from './ui/files';
import { ALT, HelpDialog, MOD } from './ui/HelpDialog';
import { icons } from './ui/icons';
import { LibraryDialog } from './ui/LibraryDialog';
import { Sidebar, type SidebarTab } from './ui/Sidebar';

type DialogName = 'library' | 'title' | 'settings' | 'help' | null;
type SaveState = 'saved' | 'saving' | 'error';
type Theme = 'system' | 'light' | 'dark';

const SAVE_DELAY = 500;

// A host page (e.g. an embedding viewer) may already set the theme; "System" defers to it.
const hostTheme = typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const value = theme === 'system' ? hostTheme : theme;
  if (value) root.dataset.theme = value;
  else delete root.dataset.theme;
}

const PREVIEW_EXPORT_MESSAGE = 'Exporting is turned off in this online preview. Run Punchline on your computer to save PDF, Fountain and Final Draft files.';

export function App() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [summaries, setSummaries] = useState<ScriptSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [compare, setCompare] = useState<{ from: string; to: string; current: ScriptElement[] } | null>(null);
  const [otherMemory, setOtherMemory] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<ScriptLayout | null>(null);
  const [cursor, setCursor] = useState<CursorInfo>({ kind: 'action', index: 0, page: 1, empty: true });
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>('scenes');
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 960);
  const [exportOpen, setExportOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const editorRef = useRef<ScriptEditorHandle>(null);
  const scriptRef = useRef<Script | null>(null);
  scriptRef.current = script;
  const dirty = useRef(false);

  const format = useMemo(() => getFormat(script?.formatId), [script?.formatId]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3200);
  }, []);

  // ---- Startup: open the library and the last script (or the sample). ----
  const started = useRef(false);
  useEffect(() => {
    // Run once, even under StrictMode's double effects (it would create two samples).
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const lib = await openLibrary();
        let current: Script | undefined;
        const lastId = await lib.getPref<string>('lastScriptId');
        if (lastId) current = await lib.load(lastId);
        const list = await lib.list();
        if (!current && list.length) current = await lib.load(list[0].id);
        if (!current) {
          current = createSampleScript();
          await lib.save(current);
        }
        const savedTheme = (await lib.getPref<Theme>('theme')) ?? 'system';
        setTheme(savedTheme);
        applyTheme(savedTheme);
        setLibrary(lib);
        setScript(current);
        setSummaries(await lib.list());
        setProjects(await lib.listProjects());
        setDrafts(await lib.listDrafts(current.id));
        setOtherMemory(await lib.memory({ projectId: current.projectId, excludeId: current.id }));
        await lib.setPref('lastScriptId', current.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // ---- Autosave. ----
  const saveNow = useCallback(async () => {
    const lib = library;
    const current = scriptRef.current;
    if (!lib || !current || !dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await lib.save(current);
      setSaveState('saved');
      setSummaries(await lib.list());
    } catch {
      dirty.current = true;
      setSaveState('error');
    }
  }, [library]);

  useEffect(() => {
    if (!dirty.current) return;
    setSaveState('saving');
    const t = window.setTimeout(saveNow, SAVE_DELAY);
    return () => window.clearTimeout(t);
  }, [script, saveNow]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveNow();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', saveNow);
    };
  }, [saveNow]);

  const update = useCallback((fn: (s: Script) => Script) => {
    setScript((prev) => {
      if (!prev) return prev;
      dirty.current = true;
      return { ...fn(prev), updatedAt: Date.now() };
    });
  }, []);

  /** The script including edits the editor hasn't reported yet. */
  const latest = useCallback((): Script | null => {
    const s = scriptRef.current;
    if (!s) return null;
    const elements = editorRef.current?.getElements() ?? s.elements;
    return { ...s, elements, characterMemory: rememberCharacters(s.characterMemory, elements) };
  }, []);

  // ---- Editor callbacks. ----
  const handleChange = useCallback(
    (elements: ScriptElement[], docKey: string) => {
      if (scriptRef.current?.id !== docKey) return;
      update((s) => ({ ...s, elements, characterMemory: rememberCharacters(s.characterMemory, elements) }));
    },
    [update],
  );

  const handleCursor = useCallback((c: CursorInfo) => {
    setCursor((prev) =>
      prev.kind === c.kind && prev.index === c.index && prev.page === c.page && prev.empty === c.empty ? prev : c,
    );
  }, []);

  // ---- Library actions. ----
  const switchTo = useCallback(
    async (next: Script) => {
      if (!library) return;
      const current = latest();
      if (current && dirty.current) await library.save(current);
      dirty.current = false;
      setScript(next);
      setSaveState('saved');
      setDialog(null);
      setCompare(null);
      setDrafts(await library.listDrafts(next.id));
      await library.setPref('lastScriptId', next.id);
      setSummaries(await library.list());
      setOtherMemory(await library.memory({ projectId: next.projectId, excludeId: next.id }));
      window.setTimeout(() => editorRef.current?.focus(), 50);
    },
    [library, latest],
  );

  const openScript = async (id: string) => {
    if (!library) return;
    if (id === script?.id) return setDialog(null);
    const next = await library.load(id);
    if (next) await switchTo(next);
  };

  const newScript = async (options: { formatId: string; blank: boolean; projectId: string | null }) => {
    if (!library) return;
    const next = createScript(options);
    // An episode or draft in a project starts with the project's title.
    const inProject = projects.find((p) => p.id === options.projectId);
    if (inProject) next.titlePage.title = inProject.title.toUpperCase();
    await library.save(next);
    await switchTo(next);
    setDialog('title');
  };

  /** Save everything in an imported file and return the script to open. */
  const storeBackup = async (backup: Backup): Promise<Script> => {
    if (!library) throw new Error('Library not ready');
    if (backup.kind === 'project') {
      await library.saveProject(backup.project);
      for (const s of backup.scripts) await library.save(s);
      for (const d of backup.drafts) await library.saveDraft(d);
      setProjects(await library.listProjects());
      if (backup.scripts.length) return backup.scripts[0];
      const empty = createScript({ formatId: backup.project.formatId, projectId: backup.project.id });
      await library.save(empty);
      return empty;
    }
    await library.save(backup.script);
    for (const d of backup.drafts) await library.saveDraft(d);
    return backup.script;
  };

  const importInto = async (projectId: string | null) => {
    if (!library) return;
    const file = await pickFile(IMPORT_ACCEPT);
    if (!file) return;
    try {
      const formatId = projects.find((p) => p.id === projectId)?.formatId;
      const backup = await importFile(file, projectId, formatId);
      const next = await storeBackup(backup);
      await switchTo(next);
      notify(backup.kind === 'project' ? `Imported the project “${backup.project.title}”` : `Imported “${displayTitle(next)}”`);
    } catch (e) {
      notify(`Couldn’t import ${file.name}: ${e instanceof Error ? e.message : 'unknown format'}`);
    }
  };

  const moveScript = async (id: string, projectId: string | null) => {
    if (!library) return;
    if (id === script?.id) {
      const moved = { ...latest()!, projectId, updatedAt: Date.now() };
      dirty.current = false;
      setScript(moved);
      await library.save(moved);
      setOtherMemory(await library.memory({ projectId, excludeId: id }));
    } else {
      const other = await library.load(id);
      if (other) await library.save({ ...other, projectId, updatedAt: Date.now() });
    }
    setSummaries(await library.list());
  };

  // ---- Projects. ----
  const addProject = async (title: string, formatId: string) => {
    const project = createProject(title, formatId);
    await library!.saveProject(project);
    setProjects(await library!.listProjects());
    return project;
  };

  const renameProject = async (id: string, title: string) => {
    const project = projects.find((p) => p.id === id);
    if (!library || !project) return;
    await library.saveProject({ ...project, title, updatedAt: Date.now() });
    setProjects(await library.listProjects());
  };

  const deleteProject = async (id: string) => {
    if (!library) return;
    await library.removeProject(id);
    setProjects(await library.listProjects());
    setSummaries(await library.list());
    if (script?.projectId === id) {
      setScript((s) => (s ? { ...s, projectId: null } : s));
      setOtherMemory(await library.memory({ projectId: null, excludeId: script.id }));
    }
  };

  const exportProject = async (id: string) => {
    if (__DEMO__) return notify(PREVIEW_EXPORT_MESSAGE);
    const project = projects.find((p) => p.id === id);
    if (!library || !project) return;
    const members: Script[] = [];
    const allDrafts: Draft[] = [];
    for (const summary of summaries.filter((s) => s.projectId === id)) {
      const member = summary.id === script?.id ? latest() : await library.load(summary.id);
      if (!member) continue;
      members.push(member);
      allDrafts.push(...(await library.listDrafts(member.id)));
    }
    downloadText(`${safeFilename(project.title)}.punchline`, serializeProjectBackup(project, members, allDrafts), 'application/json');
  };

  // ---- Drafts. ----
  const saveDraft = async (options: { name: string; color: RevisionColor | null; note: string }) => {
    const current = latest();
    if (!library || !current) return;
    const draft = createDraft(current, options);
    await library.saveDraft(draft);
    setDrafts(await library.listDrafts(current.id));
    setSummaries(await library.list());
    notify(`Saved “${draft.name}”`);
  };

  const restoreDraft = async (id: string) => {
    const current = latest();
    const draft = drafts.find((d) => d.id === id);
    if (!library || !current || !draft) return;
    // Never lose the pages being replaced: keep them as a draft too.
    await library.saveDraft(createDraft(current, { name: `Before restoring ${draft.name}`, note: 'Saved automatically' }));
    update((s) => ({ ...s, titlePage: structuredClone(draft.titlePage) }));
    editorRef.current?.replaceElements(structuredClone(draft.elements));
    setDrafts(await library.listDrafts(current.id));
    notify(`Restored “${draft.name}”. Your previous pages were saved as a draft.`);
  };

  const branchDraft = async (id: string) => {
    const current = latest();
    const draft = drafts.find((d) => d.id === id);
    if (!library || !current || !draft) return;
    const next = createScript({ formatId: current.formatId, projectId: current.projectId });
    next.titlePage = structuredClone(draft.titlePage);
    next.elements = structuredClone(draft.elements);
    next.characterMemory = rememberCharacters(current.characterMemory, next.elements);
    next.settings = { ...current.settings, revisionBaseline: null };
    await library.save(next);
    await switchTo(next);
    notify(`Started a new script from “${draft.name}”`);
  };

  const deleteDraft = async (id: string) => {
    if (!library || !script) return;
    await library.removeDraft(id);
    if (script.settings.revisionBaseline === id) update((s) => ({ ...s, settings: { ...s.settings, revisionBaseline: null } }));
    setDrafts(await library.listDrafts(script.id));
    setSummaries(await library.list());
  };

  const openCompare = (from: string, to: string) => {
    setCompare({ from, to, current: latest()?.elements ?? [] });
  };

  const duplicate = async (id: string) => {
    if (!library) return;
    const source = id === script?.id ? latest() : await library.load(id);
    if (!source) return;
    const copy: Script = {
      ...structuredClone(source),
      id: newId(),
      titlePage: { ...source.titlePage, draft: source.titlePage.draft ? `${source.titlePage.draft} (copy)` : 'Copy' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await library.save(copy);
    setSummaries(await library.list());
    notify('Duplicated');
  };

  const remove = async (id: string) => {
    if (!library) return;
    await library.remove(id);
    const list = await library.list();
    setSummaries(list);
    if (id === script?.id) {
      dirty.current = false;
      const sameProject = list.find((s) => s.projectId === script.projectId) ?? list[0];
      const next = sameProject ? await library.load(sameProject.id) : undefined;
      const fallback = next ?? createScript({ projectId: script.projectId, formatId: script.formatId });
      if (!next) await library.save(fallback);
      await switchTo(fallback);
      setDialog('library');
    }
  };

  // ---- Export. ----
  const baseName = () => safeFilename(script ? displayTitle(script) : 'Untitled Script');

  const makePdf = async () => {
    const s = latest();
    if (!s) return null;
    // jsPDF is large, so it loads the first time a PDF is made.
    const [{ renderScriptPdf }, fonts] = await Promise.all([import('./core/io/pdf'), loadPdfFonts()]);
    const revised = baseline ? revisedIndices(baseline, s.elements) : undefined;
    return renderScriptPdf(s, format, { fonts, revised }).output('blob');
  };

  const exportAs = async (kind: 'pdf' | 'fountain' | 'fdx' | 'native') => {
    setExportOpen(false);
    if (__DEMO__) return notify(PREVIEW_EXPORT_MESSAGE);
    const s = latest();
    if (!s) return;
    try {
      if (kind === 'pdf') {
        const blob = await makePdf();
        if (blob) downloadBlob(`${baseName()}.pdf`, blob);
      }
      if (kind === 'fountain') downloadText(`${baseName()}.fountain`, serializeFountain(s, format));
      if (kind === 'fdx') downloadText(`${baseName()}.fdx`, serializeFdx(s, format), 'application/xml');
      if (kind === 'native') downloadText(`${baseName()}.punchline`, serializeScriptBackup(s, drafts), 'application/json');
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const previewPdf = async () => {
    if (__DEMO__) return notify(PREVIEW_EXPORT_MESSAGE);
    const blob = await makePdf();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      downloadBlob(`${baseName()}.pdf`, blob);
      notify('Pop-up blocked — downloaded the PDF instead.');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleShortcut = (name: Shortcut) => {
    if (name === 'save') {
      dirty.current = true;
      void saveNow();
      notify('Saved');
    }
    if (name === 'print') void previewPdf();
    if (name === 'help') setDialog('help');
  };

  const project = projects.find((p) => p.id === script?.projectId) ?? null;
  const baselineDraft = drafts.find((d) => d.id === script?.settings.revisionBaseline) ?? null;
  const baseline = baselineDraft?.elements ?? null;
  const draftSuggestion = useMemo(() => suggestDraftName(drafts), [drafts]);
  const versions: Version[] = useMemo(
    () =>
      compare
        ? [
            { id: 'current', label: 'Current pages (now)', elements: compare.current },
            ...drafts.map((d) => ({ id: d.id, label: `${d.name} · ${formatDate(d.createdAt)}`, elements: d.elements })),
          ]
        : [],
    [compare, drafts],
  );

  // ---- Characters. ----
  const analysis = useMemo(() => analyzeScript(script?.elements ?? []), [script?.elements]);
  const memory = useMemo(() => {
    const merged = { ...otherMemory };
    for (const [k, v] of Object.entries(script?.characterMemory ?? {})) merged[k] = (merged[k] ?? 0) + v;
    return merged;
  }, [otherMemory, script?.characterMemory]);
  const inScript = useMemo(() => new Set(analysis.characters.map((c) => c.name)), [analysis.characters]);
  const rememberedHere = useMemo(
    () => Object.keys(script?.characterMemory ?? {}).filter((n) => !inScript.has(n)).sort(),
    [script?.characterMemory, inScript],
  );
  const rememberedElsewhere = useMemo(
    () =>
      Object.entries(otherMemory)
        .filter(([n]) => !inScript.has(n) && !(script?.characterMemory ?? {})[n])
        .sort((a, b) => b[1] - a[1])
        .map(([n]) => n)
        .slice(0, 40),
    [otherMemory, inScript, script?.characterMemory],
  );

  const renameCharacter = (from: string, to: string) => {
    const elements = editorRef.current?.getElements();
    if (!elements) return;
    const renamed = elements.map((el) => {
      if (el.kind !== 'character' || characterName(plainText(el)) !== from) return el;
      const text = plainText(el).trim();
      const rest = text.slice(text.indexOf('(') >= 0 ? text.indexOf('(') : text.length);
      return { kind: el.kind, runs: [{ text: rest ? `${to} ${rest.trim()}` : to }] };
    });
    update((s) => {
      const characterMemory = { ...s.characterMemory };
      characterMemory[to] = (characterMemory[to] ?? 0) + (characterMemory[from] ?? 0);
      delete characterMemory[from];
      return { ...s, characterMemory };
    });
    editorRef.current?.replaceElements(renamed);
    notify(`Renamed ${from} to ${to}`);
  };

  const forget = (name: string) =>
    update((s) => {
      const characterMemory = { ...s.characterMemory };
      delete characterMemory[name];
      return { ...s, characterMemory };
    });

  const moveSceneTo = (from: number, target: number | { actEnd: number }) => {
    const elements = editorRef.current?.getElements();
    if (!elements) return;
    if (elements[from]?.kind !== 'scene_heading') return notify('The script changed — try that again.');
    const to = typeof target === 'number' ? target : endOfActIndex(elements, target.actEnd);
    const result = moveScene(elements, from, to);
    if (!result) return;
    editorRef.current?.replaceElements(result.elements);
    editorRef.current?.goToElement(result.index);
  };

  const setSettings = (settings: ScriptSettings) => update((s) => ({ ...s, settings }));
  const setTitlePage = (titlePage: TitlePage) => update((s) => ({ ...s, titlePage }));
  const changeTheme = (t: string) => {
    setTheme(t as Theme);
    applyTheme(t as Theme);
    void library?.setPref('theme', t);
  };

  const goTo = (index: number) => {
    editorRef.current?.goToElement(index);
    if (window.innerWidth <= 960) setSidebarOpen(false);
  };

  // Close the export menu on outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu-wrap')) setExportOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [exportOpen]);

  if (loadError) {
    return (
      <div className="boot">
        <p>Punchline couldn’t start: {loadError}</p>
      </div>
    );
  }
  if (!script || !library) {
    return (
      <div className="boot" aria-busy="true">
        <p>Opening your scripts…</p>
      </div>
    );
  }

  const label = (k: ElementKind) => format.elements[k].label;
  const enterTarget = cursor.empty ? (format.flow.emptyEnter[cursor.kind] ?? format.flow.enter[cursor.kind]) : format.flow.enter[cursor.kind];
  const tabTarget = nextInCycle(format, cursor.kind);
  const pages = layout?.pages.length ?? 1;
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className={`app${sidebarOpen ? ' with-sidebar' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={() => setSidebarOpen((o) => !o)} aria-label="Toggle navigator" aria-pressed={sidebarOpen} title="Navigator">
            {icons.sidebar()}
          </button>
          <span className="brand" aria-label="Punchline">
            Punchline
          </span>
          <button className="btn btn-quiet" onClick={() => setDialog('library')} title="Projects, scripts and drafts">
            {icons.library()}
            <span className="hide-sm">Library</span>
          </button>
          {project && (
            <button className="crumb hide-sm" onClick={() => setDialog('library')} title="Open this project in the library">
              {project.title}
              <span aria-hidden="true">/</span>
            </button>
          )}
          <button className="doc-title" onClick={() => setDialog('title')} title="Edit title page">
            {displayTitle(script)}
          </button>
          {__DEMO__ && (
            <span className="preview-pill" title={PREVIEW_EXPORT_MESSAGE}>
              Preview
            </span>
          )}
        </div>
        <div className="topbar-tools" role="toolbar" aria-label="Formatting">
          <label className="element-picker">
            <span className="visually-hidden">Element</span>
            <select value={cursor.kind} onChange={(e) => editorRef.current?.setKind(e.target.value as ElementKind)} aria-label="Element type">
              {(format.elementOrder.includes(cursor.kind) ? format.elementOrder : [...format.elementOrder, cursor.kind]).map((k) => (
                <option key={k} value={k}>
                  {format.elements[k].label} ({ALT}+{format.elements[k].shortcut})
                </option>
              ))}
            </select>
          </label>
          <span className="tool-group hide-sm">
            <button className="icon-btn text-btn" onMouseDown={keep} onClick={() => editorRef.current?.toggleMark('bold')} title={`Bold (${MOD}+B)`} aria-label="Bold">
              <b>B</b>
            </button>
            <button className="icon-btn text-btn" onMouseDown={keep} onClick={() => editorRef.current?.toggleMark('italic')} title={`Italic (${MOD}+I)`} aria-label="Italic">
              <i>I</i>
            </button>
            <button className="icon-btn text-btn" onMouseDown={keep} onClick={() => editorRef.current?.toggleMark('underline')} title={`Underline (${MOD}+U)`} aria-label="Underline">
              <u>U</u>
            </button>
          </span>
          <span className="tool-group hide-sm">
            <button className="icon-btn" onMouseDown={keep} onClick={() => editorRef.current?.undo()} title={`Undo (${MOD}+Z)`} aria-label="Undo">
              {icons.undo()}
            </button>
            <button className="icon-btn" onMouseDown={keep} onClick={() => editorRef.current?.redo()} title={`Redo (${MOD}+Shift+Z)`} aria-label="Redo">
              {icons.redo()}
            </button>
          </span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-quiet hide-sm" onClick={() => importInto(script.projectId)} title="Import Fountain, Final Draft or Punchline file">
            {icons.upload()}
            <span className="hide-md">Import</span>
          </button>
          <div className="menu-wrap">
            <button className="btn btn-quiet" onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
              {icons.download()}
              <span className="hide-md">Export</span>
            </button>
            {exportOpen && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => exportAs('pdf')}>
                  PDF <span className="menu-hint">print-ready</span>
                </button>
                <button role="menuitem" onClick={() => exportAs('fountain')}>
                  Fountain <span className="menu-hint">.fountain</span>
                </button>
                <button role="menuitem" onClick={() => exportAs('fdx')}>
                  Final Draft <span className="menu-hint">.fdx</span>
                </button>
                <button role="menuitem" onClick={() => exportAs('native')}>
                  Punchline backup <span className="menu-hint">with drafts</span>
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={previewPdf} title={`Preview PDF (${MOD}+P)`}>
            {icons.pdf()}
            <span className="hide-sm">PDF</span>
          </button>
          <button className="icon-btn" onClick={() => setDialog('settings')} aria-label="Settings" title="Settings">
            {icons.settings()}
          </button>
          <button className="icon-btn" onClick={() => setDialog('help')} aria-label="Cheat sheet" title={`Cheat sheet (${MOD}+/)`}>
            {icons.help()}
          </button>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && (
          <>
            <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
            <Sidebar
              tab={tab}
              onTab={setTab}
              analysis={analysis}
              elementPages={layout?.elementPages ?? []}
              cursorIndex={cursor.index}
              rememberedHere={rememberedHere}
              rememberedElsewhere={rememberedElsewhere}
              elsewhereLabel={project ? `From other scripts in ${project.title}` : 'From your other scripts'}
              draftCount={drafts.length}
              drafts={
                <DraftsPanel
                  drafts={drafts}
                  baselineId={baselineDraft?.id ?? null}
                  suggestion={draftSuggestion}
                  onSave={saveDraft}
                  onRestore={restoreDraft}
                  onBranch={branchDraft}
                  onDelete={deleteDraft}
                  onCompare={openCompare}
                  onBaseline={(id) => update((s) => ({ ...s, settings: { ...s.settings, revisionBaseline: id } }))}
                />
              }
              showSceneNumbers={script.settings.sceneNumbers}
              onGo={goTo}
              onRename={setRenaming}
              onForget={forget}
              onAddNote={() => editorRef.current?.insertElement('note')}
              onMoveScene={moveSceneTo}
            />
          </>
        )}
        <main className="desk">
          <ScriptEditor
            ref={editorRef}
            docKey={script.id}
            initialElements={script.elements}
            format={format}
            settings={script.settings}
            baseline={baseline}
            memory={memory}
            onChange={handleChange}
            onLayout={setLayout}
            onCursor={handleCursor}
            onShortcut={handleShortcut}
          />
        </main>
      </div>

      <footer className="statusbar">
        <span className="status-element">
          <b>{label(cursor.kind)}</b>
          <span className="status-hints">
            <span>
              <kbd>↵</kbd> {label(enterTarget)}
            </span>
            <span>
              <kbd>⇥</kbd> {label(tabTarget)}
            </span>
          </span>
        </span>
        <span className="status-stats">
          <span>
            Page {Math.min(cursor.page, pages)} of {pages}
          </span>
          {baselineDraft && (
            <button
              className="rev-indicator hide-sm"
              onClick={() => {
                setTab('drafts');
                setSidebarOpen(true);
              }}
              title="Revision marks are on"
            >
              * since {baselineDraft.name}
            </button>
          )}
          <span className="hide-sm">{analysis.scenes.length} scenes</span>
          <span className="hide-sm">{analysis.words.toLocaleString()} words</span>
          <span className={`save-state ${saveState}`} role="status">
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : library.persistent ? 'Saved' : 'Not stored — export to keep'}
          </span>
        </span>
      </footer>

      <LibraryDialog
        open={dialog === 'library'}
        scripts={summaries}
        projects={projects}
        currentId={script.id}
        currentProjectId={script.projectId}
        persistent={library.persistent}
        formats={FORMATS}
        onOpen={openScript}
        onNew={newScript}
        onImport={importInto}
        onDuplicate={duplicate}
        onDelete={remove}
        onMove={moveScript}
        onCreateProject={addProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onExportProject={exportProject}
        onClose={() => setDialog(null)}
      />
      <CompareDialog
        open={compare !== null}
        versions={versions}
        from={compare?.from ?? ''}
        to={compare?.to ?? 'current'}
        onPick={(from, to) => setCompare((c) => (c ? { ...c, from, to } : c))}
        onClose={() => setCompare(null)}
      />
      <TitlePageDialog open={dialog === 'title'} value={script.titlePage} episodic={format.episodic} onSave={setTitlePage} onClose={() => setDialog(null)} />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={script.settings}
        formatId={format.id}
        formats={FORMATS}
        onFormat={(formatId) => update((s) => ({ ...s, formatId }))}
        theme={theme}
        onTheme={changeTheme}
        onChange={setSettings}
        onClose={() => setDialog(null)}
      />
      <HelpDialog open={dialog === 'help'} format={format} onClose={() => setDialog(null)} />
      <RenameDialog name={renaming} onRename={renameCharacter} onClose={() => setRenaming(null)} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
