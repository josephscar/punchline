import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScriptFormat } from '../core/formats';
import type { ScriptSettings, TitlePage } from '../core/types';
import type { ScriptSummary } from '../storage/library';
import { icons } from './icons';

/** Accessible modal built on <dialog>. */
export function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className={`modal${props.wide ? ' modal-wide' : ''}`}
      onClose={props.onClose}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
      aria-labelledby="modal-title"
    >
      {props.open && (
        <div className="modal-inner">
          <header className="modal-head">
            <h2 id="modal-title">{props.title}</h2>
            <button className="icon-btn" onClick={props.onClose} aria-label="Close">
              {icons.close()}
            </button>
          </header>
          <div className="modal-body">{props.children}</div>
          {props.footer && <footer className="modal-foot">{props.footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function TitlePageDialog(props: { open: boolean; value: TitlePage; onSave: (tp: TitlePage) => void; onClose: () => void }) {
  const [tp, setTp] = useState(props.value);
  useEffect(() => {
    if (props.open) setTp(props.value);
  }, [props.open, props.value]);
  const field = (key: keyof TitlePage, label: string, hint?: string, multiline = false) => (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea rows={3} value={tp[key]} onChange={(e) => setTp({ ...tp, [key]: e.target.value })} />
      ) : (
        <input value={tp[key]} onChange={(e) => setTp({ ...tp, [key]: e.target.value })} />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
  return (
    <Modal
      open={props.open}
      title="Title page"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={props.onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              props.onSave(tp);
              props.onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        {field('title', 'Series title', 'Printed in capitals, e.g. PAPER TRAIL')}
        {field('episode', 'Episode title', 'Printed in quotes, e.g. "Pilot"')}
        {field('credit', 'Credit', 'Written by · Teleplay by · Story by')}
        {field('authors', 'Writers', 'One per line', true)}
        {field('source', 'Based on (optional)')}
        {field('draft', 'Draft & date', 'e.g. First Draft — 9/27/2026')}
        {field('contact', 'Contact', 'Agent, email, phone — one per line', true)}
      </div>
    </Modal>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ts).toLocaleDateString();
}

export function LibraryDialog(props: {
  open: boolean;
  scripts: ScriptSummary[];
  currentId: string | null;
  persistent: boolean;
  formats: ScriptFormat[];
  onOpen: (id: string) => void;
  onNew: (options: { formatId: string; blank: boolean }) => void;
  onImport: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => setConfirm(null), [props.open]);
  return (
    <Modal open={props.open} title="Scripts" onClose={props.onClose} wide>
      <div className="new-grid">
        {props.formats.map((f) => (
          <button key={f.id} className="new-card" onClick={() => props.onNew({ formatId: f.id, blank: false })}>
            <span className="new-card-title">{icons.plus()} New {f.name}</span>
            <span className="new-card-desc">Starts with a cold open, two acts and a tag.</span>
          </button>
        ))}
        <button className="new-card" onClick={() => props.onNew({ formatId: props.formats[0].id, blank: true })}>
          <span className="new-card-title">{icons.plus()} Blank page</span>
          <span className="new-card-desc">Same format, no act structure.</span>
        </button>
        <button className="new-card" onClick={props.onImport}>
          <span className="new-card-title">{icons.upload()} Import a file</span>
          <span className="new-card-desc">Fountain, Final Draft (.fdx) or Punchline.</span>
        </button>
      </div>
      {!props.persistent && (
        <p className="warning">This browser isn’t letting Punchline save between visits. Export your work (Export → Punchline backup) before closing the tab.</p>
      )}
      <h3 className="section-title">Your scripts</h3>
      <ul className="script-list">
        {props.scripts.map((s) => (
          <li key={s.id} className={s.id === props.currentId ? 'is-current' : ''}>
            <button className="script-open" onClick={() => props.onOpen(s.id)}>
              <span className="script-title">{s.title}</span>
              <span className="script-meta">
                {s.id === props.currentId ? 'Open now · ' : ''}Edited {timeAgo(s.updatedAt)}
              </span>
            </button>
            {confirm === s.id ? (
              <span className="confirm">
                Delete forever?
                <button className="btn btn-danger small" onClick={() => props.onDelete(s.id)}>
                  Delete
                </button>
                <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <span className="row-actions">
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
    </Modal>
  );
}

export function SettingsDialog(props: {
  open: boolean;
  settings: ScriptSettings;
  theme: string;
  onTheme: (theme: string) => void;
  onChange: (settings: ScriptSettings) => void;
  onClose: () => void;
}) {
  const toggle = (key: keyof ScriptSettings, label: string, hint: string) => (
    <label className="toggle">
      <input type="checkbox" checked={props.settings[key]} onChange={(e) => props.onChange({ ...props.settings, [key]: e.target.checked })} />
      <span>
        <span className="toggle-label">{label}</span>
        <span className="field-hint">{hint}</span>
      </span>
    </label>
  );
  return (
    <Modal open={props.open} title="Settings" onClose={props.onClose}>
      <h3 className="section-title">This script</h3>
      {toggle('autoContd', "Automatic (CONT'D)", 'Adds (CONT’D) when a character speaks again after action in the same scene.')}
      {toggle('sceneNumbers', 'Scene numbers', 'Numbers scenes in both margins — usually only for production drafts.')}
      {toggle('includeTitlePage', 'Title page in PDF', 'Adds the title page when you export or print.')}
      <h3 className="section-title">Appearance</h3>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {['system', 'light', 'dark'].map((t) => (
          <button key={t} role="radio" aria-checked={props.theme === t} className={props.theme === t ? 'is-active' : ''} onClick={() => props.onTheme(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function RenameDialog(props: { name: string | null; onRename: (from: string, to: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(props.name ?? ''), [props.name]);
  const submit = () => {
    const to = value.trim().toUpperCase();
    if (props.name && to && to !== props.name) props.onRename(props.name, to);
    props.onClose();
  };
  return (
    <Modal
      open={props.name !== null}
      title={`Rename ${props.name ?? ''}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Rename everywhere
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">New name</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <span className="field-hint">Every character cue is renamed; extensions like (V.O.) are kept.</span>
      </label>
    </Modal>
  );
}
