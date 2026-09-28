import { useEffect, useState } from 'react';
import type { ScriptFormat } from '../core/formats';
import type { Project } from '../core/types';
import type { ScriptSummary } from '../storage/library';
import { Modal } from './Dialogs';
import { icons } from './icons';

type Folder = 'all' | 'unfiled' | string;

function timeAgo(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ts).toLocaleDateString();
}

interface Props {
  open: boolean;
  scripts: ScriptSummary[];
  projects: Project[];
  currentId: string | null;
  currentProjectId: string | null;
  persistent: boolean;
  /** Signed in to cloud sync: projects are in the cloud, other scripts only on this device. */
  synced: boolean;
  formats: ScriptFormat[];
  onOpen: (id: string) => void;
  onNew: (options: { formatId: string; blank: boolean; projectId: string | null }) => void;
  onImport: (projectId: string | null) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
  onCreateProject: (title: string, formatId: string) => Promise<Project>;
  onRenameProject: (id: string, title: string) => void;
  onDeleteProject: (id: string) => void;
  onExportProject: (id: string) => void;
  onClose: () => void;
}

export function LibraryDialog(props: Props) {
  const { scripts, projects, formats, synced } = props;
  const [folder, setFolder] = useState<Folder>('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<{ title: string; formatId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setFolder(props.currentProjectId ?? 'all');
    setConfirm(null);
    setNewProject(null);
    setRenaming(null);
  }, [props.open, props.currentProjectId]);

  const project = projects.find((p) => p.id === folder) ?? null;
  const projectId = project ? project.id : null;
  const shown = scripts.filter((s) => (folder === 'all' ? true : folder === 'unfiled' ? !s.projectId : s.projectId === folder));
  const formatName = (id: string) => formats.find((f) => f.id === id)?.name ?? '';
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.title ?? '';
  const count = (f: Folder) => scripts.filter((s) => (f === 'all' ? true : f === 'unfiled' ? !s.projectId : s.projectId === f)).length;
  // Put the project's own format first on the "New" cards.
  const orderedFormats = project ? [...formats].sort((a, b) => Number(b.id === project.formatId) - Number(a.id === project.formatId)) : formats;

  const folderButton = (f: Folder, label: string, cloud = false) => (
    <button className={`lib-folder${folder === f ? ' is-active' : ''}`} onClick={() => setFolder(f)} aria-current={folder === f ? 'true' : undefined}>
      <span className="lib-folder-name">{label}</span>
      {cloud && (
        <span className="lib-cloud" title="Synced to the cloud" aria-label="synced">
          {icons.cloud()}
        </span>
      )}
      <span className="lib-folder-count">{count(f)}</span>
    </button>
  );

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject?.title.trim()) return;
    const p = await props.onCreateProject(newProject.title, newProject.formatId);
    setNewProject(null);
    setFolder(p.id);
  };

  return (
    <Modal open={props.open} title="Library" onClose={props.onClose} wide>
      <div className="lib">
        <nav className="lib-folders" aria-label="Projects">
          {folderButton('all', 'All scripts')}
          <h3 className="section-title">Projects</h3>
          {projects.map((p) => (
            <div key={p.id}>{folderButton(p.id, p.title, synced)}</div>
          ))}
          {projects.length === 0 && <p className="nav-hint">Group a series’ episodes, or a film’s drafts, into a project.</p>}
          {newProject ? (
            <form className="lib-new-project" onSubmit={createProject}>
              <input
                id="new-project-title"
                aria-label="Project name"
                placeholder="Series or film title"
                autoFocus
                value={newProject.title}
                onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
              />
              <select
                id="new-project-format"
                aria-label="Format for new scripts"
                value={newProject.formatId}
                onChange={(e) => setNewProject({ ...newProject, formatId: e.target.value })}
              >
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <span className="row-actions">
                <button className="btn btn-primary small" type="submit">
                  Create
                </button>
                <button className="btn btn-quiet small" type="button" onClick={() => setNewProject(null)}>
                  Cancel
                </button>
              </span>
            </form>
          ) : (
            <button className="btn btn-quiet small lib-add" onClick={() => setNewProject({ title: '', formatId: formats[0].id })}>
              {icons.plus()} New project
            </button>
          )}
          <div className="lib-divider" />
          {folderButton('unfiled', 'Not in a project')}
        </nav>

        <section className="lib-main" aria-label="Scripts">
          <header className="lib-head">
            {project && renaming === project.id ? (
              <form
                className="lib-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem('project-title') as HTMLInputElement).value;
                  if (input.trim()) props.onRenameProject(project.id, input.trim());
                  setRenaming(null);
                }}
              >
                <input id="project-title" name="project-title" aria-label="Project name" defaultValue={project.title} autoFocus />
                <button className="btn btn-primary small" type="submit">
                  Save
                </button>
              </form>
            ) : (
              <h3 className="lib-title">{project ? project.title : folder === 'unfiled' ? 'Not in a project' : 'All scripts'}</h3>
            )}
            {project && renaming !== project.id && (
              <span className="row-actions">
                <button className="btn btn-quiet small" onClick={() => setRenaming(project.id)}>
                  Rename
                </button>
                <button className="btn btn-quiet small" onClick={() => props.onExportProject(project.id)}>
                  {icons.download()} Back up project
                </button>
                {confirm === `project-${project.id}` ? (
                  <span className="confirm">
                    {synced ? 'Delete the project here and in the cloud? Its scripts are kept on each device, outside any project.' : 'Delete the project? Its scripts are kept.'}
                    <button
                      className="btn btn-danger small"
                      onClick={() => {
                        props.onDeleteProject(project.id);
                        setFolder('unfiled');
                        setConfirm(null);
                      }}
                    >
                      Delete project
                    </button>
                    <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button className="icon-btn small" onClick={() => setConfirm(`project-${project.id}`)} aria-label={`Delete project ${project.title}`} title="Delete project">
                    {icons.trash()}
                  </button>
                )}
              </span>
            )}
          </header>

          <div className="new-grid">
            {orderedFormats.map((f) => (
              <button key={f.id} className="new-card" onClick={() => props.onNew({ formatId: f.id, blank: false, projectId })}>
                <span className="new-card-title">
                  {icons.plus()} New {f.name}
                </span>
                <span className="new-card-desc">{f.templateSummary}</span>
              </button>
            ))}
            <button className="new-card" onClick={() => props.onNew({ formatId: project?.formatId ?? formats[0].id, blank: true, projectId })}>
              <span className="new-card-title">{icons.plus()} Blank page</span>
              <span className="new-card-desc">{project ? formatName(project.formatId) : formats[0].name}, no structure.</span>
            </button>
            <button className="new-card" onClick={() => props.onImport(projectId)}>
              <span className="new-card-title">{icons.upload()} Import a file</span>
              <span className="new-card-desc">Fountain, Final Draft (.fdx) or a Punchline backup.</span>
            </button>
          </div>
          {synced && folder === 'unfiled' && (
            <p className="lib-note">{icons.device()} Scripts outside a project stay on this device. Move one into a project to sync it.</p>
          )}
          {!props.persistent && (
            <p className="warning">This browser isn’t letting Punchline save between visits. Export your work (Export → Punchline backup) before closing the tab.</p>
          )}

          {shown.length === 0 ? (
            <p className="nav-empty">No scripts here yet.</p>
          ) : (
            <ul className="script-list">
              {shown.map((s) => (
                <li key={s.id} className={s.id === props.currentId ? 'is-current' : ''}>
                  <button className="script-open" onClick={() => props.onOpen(s.id)}>
                    <span className="script-title">{s.title}</span>
                    <span className="script-meta">
                      {[
                        s.id === props.currentId ? 'Open now' : null,
                        formatName(s.formatId),
                        folder === 'all' && s.projectId ? projectName(s.projectId) : null,
                        synced && !s.projectId ? 'this device only' : null,
                        s.drafts ? `${s.drafts} ${s.drafts === 1 ? 'draft' : 'drafts'}` : null,
                        `edited ${timeAgo(s.updatedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  {confirm === `unfile-${s.id}` ? (
                    <span className="confirm">
                      Take it out of the project? It leaves the cloud and your other devices, and stays only here.
                      <button
                        className="btn btn-danger small"
                        onClick={() => {
                          props.onMove(s.id, null);
                          setConfirm(null);
                        }}
                      >
                        Move
                      </button>
                      <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : confirm === s.id ? (
                    <span className="confirm">
                      {synced && s.projectId ? 'Delete it and its drafts on all your devices?' : 'Delete it and its drafts?'}
                      <button className="btn btn-danger small" onClick={() => props.onDelete(s.id)}>
                        Delete
                      </button>
                      <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="row-actions">
                      <select
                        className="move-select"
                        aria-label={`Project for ${s.title}`}
                        title="Move to project"
                        value={s.projectId ?? ''}
                        onChange={(e) => {
                          const to = e.target.value || null;
                          if (synced && s.projectId && !to) setConfirm(`unfile-${s.id}`);
                          else props.onMove(s.id, to);
                        }}
                      >
                        <option value="">No project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <button className="icon-btn" onClick={() => props.onDuplicate(s.id)} title="Duplicate" aria-label={`Duplicate ${s.title}`}>
                        {icons.copy()}
                      </button>
                      <button className="icon-btn" onClick={() => setConfirm(s.id)} title="Delete" aria-label={`Delete ${s.title}`}>
                        {icons.trash()}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
