import { useEffect, useState } from 'react';
import { REVISION_COLORS, type Draft, type RevisionColor } from '../core/types';
import { icons } from './icons';

/** Swatches for the studio revision colours (the page colours of printed revisions). */
export const REVISION_SWATCH: Record<RevisionColor, string> = {
  White: '#f7f6f2',
  Blue: '#9cc3f5',
  Pink: '#f5a9cf',
  Yellow: '#f7de5c',
  Green: '#93dea6',
  Goldenrod: '#d9a52b',
  Buff: '#ecd9a0',
  Salmon: '#f59a86',
  Cherry: '#d8375f',
  Tan: '#cfb28c',
};

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface Props {
  drafts: Draft[];
  baselineId: string | null;
  suggestion: { name: string; color: RevisionColor };
  onSave: (draft: { name: string; color: RevisionColor | null; note: string }) => void;
  onRestore: (id: string) => void;
  onBranch: (id: string) => void;
  onDelete: (id: string) => void;
  onCompare: (from: string, to: string) => void;
  onBaseline: (id: string | null) => void;
}

export function DraftsPanel(props: Props) {
  const { drafts } = props;
  const [name, setName] = useState(props.suggestion.name);
  const [color, setColor] = useState<RevisionColor | ''>(props.suggestion.color);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'restore' | 'delete' } | null>(null);

  // Offer the next name whenever the list of drafts changes.
  useEffect(() => {
    setName(props.suggestion.name);
    setColor(props.suggestion.color);
  }, [props.suggestion.name, props.suggestion.color]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    props.onSave({ name, color: color || null, note });
    setNote('');
  };

  return (
    <div className="nav-panel drafts">
      <form className="draft-form" onSubmit={save}>
        <p className="nav-hint">Save a draft to keep a copy of the script exactly as it is now. You can compare with it, go back to it, or start a new script from it.</p>
        <label className="field">
          <span className="field-label">Draft name</span>
          <input id="draft-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="draft-form-row">
          <label className="field">
            <span className="field-label">Revision colour</span>
            <select id="draft-color" value={color} onChange={(e) => setColor(e.target.value as RevisionColor | '')}>
              <option value="">None</option>
              {REVISION_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <input id="draft-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sent to showrunner" />
        </label>
        <button className="btn btn-primary" type="submit">
          {icons.plus()} Save draft
        </button>
      </form>

      {drafts.length > 0 && (
        <>
          <label className="field revision-marks">
            <span className="field-label">Revision marks</span>
            <select id="revision-baseline" value={props.baselineId ?? ''} onChange={(e) => props.onBaseline(e.target.value || null)}>
              <option value="">Off</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  Changes since {d.name}
                </option>
              ))}
            </select>
            <span className="field-hint">Changed lines get a * in the right margin, in the editor and the PDF.</span>
          </label>

          <div className="draft-list-head">
            <h3>Saved drafts</h3>
            {drafts.length > 1 && (
              <button className="link-btn" onClick={() => props.onCompare(drafts[1].id, drafts[0].id)}>
                Compare the last two
              </button>
            )}
          </div>
          <ul className="draft-list">
            {drafts.map((d) => (
              <li key={d.id} className="draft">
                <div className="draft-head">
                  <span
                    className="swatch"
                    style={{ background: d.color ? REVISION_SWATCH[d.color] : 'transparent' }}
                    title={d.color ? `${d.color} pages` : 'No revision colour'}
                  />
                  <span className="draft-name">{d.name}</span>
                  {props.baselineId === d.id && <span className="pill">Marking changes</span>}
                </div>
                <div className="draft-meta">
                  {formatDate(d.createdAt)}
                  {d.color ? ` · ${d.color}` : ''}
                </div>
                {d.note && <p className="draft-note">{d.note}</p>}
                {confirm?.id === d.id ? (
                  <div className="confirm-box" role="alert">
                    {confirm.action === 'restore' ? (
                      <>
                        <span>Replace your pages with “{d.name}”? The current pages are saved as a draft first.</span>
                        <span className="confirm-actions">
                          <button
                            className="btn btn-primary small"
                            onClick={() => {
                              setConfirm(null);
                              props.onRestore(d.id);
                            }}
                          >
                            Restore
                          </button>
                          <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                            Cancel
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Delete “{d.name}” for good?</span>
                        <span className="confirm-actions">
                          <button
                            className="btn btn-danger small"
                            onClick={() => {
                              setConfirm(null);
                              props.onDelete(d.id);
                            }}
                          >
                            Delete
                          </button>
                          <button className="btn btn-quiet small" onClick={() => setConfirm(null)}>
                            Keep
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="draft-actions">
                    <button className="btn btn-quiet small" onClick={() => props.onCompare(d.id, 'current')}>
                      Compare with now
                    </button>
                    <button className="btn btn-quiet small" onClick={() => setConfirm({ id: d.id, action: 'restore' })}>
                      Restore
                    </button>
                    <button className="btn btn-quiet small" onClick={() => props.onBranch(d.id)} title="Start a separate script from this draft">
                      New script from this
                    </button>
                    <button className="icon-btn small" onClick={() => setConfirm({ id: d.id, action: 'delete' })} aria-label={`Delete ${d.name}`} title="Delete draft">
                      {icons.trash()}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {drafts.length === 0 && <p className="nav-empty">No drafts yet. Save one before a big rewrite, a table read or sending pages out.</p>}
    </div>
  );
}
