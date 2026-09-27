import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScriptFormat } from '../core/formats';
import type { ScriptSettings, TitlePage } from '../core/types';
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

export function TitlePageDialog(props: {
  open: boolean;
  value: TitlePage;
  episodic: boolean;
  onSave: (tp: TitlePage) => void;
  onClose: () => void;
}) {
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
        {props.episodic ? field('title', 'Series title', 'Printed in capitals, e.g. PAPER TRAIL') : field('title', 'Title', 'Printed in capitals')}
        {props.episodic && field('episode', 'Episode title', 'Printed in quotes, e.g. "Pilot"')}
        {field('credit', 'Credit', 'Written by · Teleplay by · Story by')}
        {field('authors', 'Writers', 'One per line', true)}
        {field('source', 'Based on (optional)')}
        {field('draft', 'Draft & date', 'e.g. First Draft — 9/27/2026')}
        {field('contact', 'Contact', 'Agent, email, phone — one per line', true)}
      </div>
    </Modal>
  );
}

type ToggleSetting = 'autoContd' | 'sceneNumbers' | 'includeTitlePage';

export function SettingsDialog(props: {
  open: boolean;
  settings: ScriptSettings;
  formatId: string;
  formats: ScriptFormat[];
  onFormat: (formatId: string) => void;
  theme: string;
  onTheme: (theme: string) => void;
  onChange: (settings: ScriptSettings) => void;
  onClose: () => void;
}) {
  const current = props.formats.find((f) => f.id === props.formatId);
  const toggle = (key: ToggleSetting, label: string, hint: string) => (
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
      <label className="field">
        <span className="field-label">Format</span>
        <select id="settings-format" value={props.formatId} onChange={(e) => props.onFormat(e.target.value)}>
          {props.formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {current?.description} Your text stays as it is; act headings are kept even in formats without acts.
        </span>
      </label>
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
