import { useMemo, useState } from 'react';
import { compareScripts, type ElementChange } from '../core/diff';
import { plainText, type ScriptElement, type TextRun } from '../core/types';
import { Modal } from './Dialogs';

export interface Version {
  /** "current" for the working script, otherwise a draft id. */
  id: string;
  label: string;
  elements: ScriptElement[];
}

/** Unchanged lines kept around each change for context. */
const CONTEXT = 1;

type Row = { type: 'change'; change: ElementChange } | { type: 'gap'; count: number };

function rowsFor(changes: ElementChange[], showAll: boolean): Row[] {
  if (showAll) return changes.map((change) => ({ type: 'change', change }));
  const keep = changes.map((c) => c.type !== 'same');
  changes.forEach((c, i) => {
    if (c.type === 'same') return;
    for (let d = 1; d <= CONTEXT; d++) {
      if (i - d >= 0) keep[i - d] = true;
      if (i + d < changes.length) keep[i + d] = true;
    }
  });
  const rows: Row[] = [];
  let gap = 0;
  changes.forEach((change, i) => {
    if (keep[i]) {
      if (gap) rows.push({ type: 'gap', count: gap });
      gap = 0;
      rows.push({ type: 'change', change });
    } else {
      gap++;
    }
  });
  if (gap) rows.push({ type: 'gap', count: gap });
  return rows;
}

function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.underline) node = <u>{node}</u>;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function ChangeLine({ change }: { change: ElementChange }) {
  switch (change.type) {
    case 'same':
      return (
        <p className="pl-el cmp-same" data-kind={change.after.kind}>
          <Runs runs={change.after.runs} />
        </p>
      );
    case 'added':
      return (
        <p className="pl-el cmp-added" data-kind={change.after.kind}>
          <span className="visually-hidden">Added: </span>
          <Runs runs={change.after.runs} />
        </p>
      );
    case 'removed':
      return (
        <p className="pl-el cmp-removed" data-kind={change.before.kind}>
          <span className="visually-hidden">Removed: </span>
          <del>{plainText(change.before)}</del>
        </p>
      );
    case 'changed':
      return (
        <p className="pl-el cmp-changed" data-kind={change.after.kind}>
          <span className="visually-hidden">Changed: </span>
          {change.words.map((w, i) =>
            w.type === 'same' ? <span key={i}>{w.text}</span> : w.type === 'added' ? <ins key={i}>{w.text}</ins> : <del key={i}>{w.text}</del>,
          )}
        </p>
      );
  }
}

export function CompareDialog(props: {
  open: boolean;
  versions: Version[];
  from: string;
  to: string;
  onPick: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const from = props.versions.find((v) => v.id === props.from) ?? props.versions[props.versions.length - 1];
  const to = props.versions.find((v) => v.id === props.to) ?? props.versions[0];
  const comparison = useMemo(() => (from && to ? compareScripts(from.elements, to.elements) : null), [from, to]);
  const rows = useMemo(() => (comparison ? rowsFor(comparison.changes, showAll) : []), [comparison, showAll]);

  const picker = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <label className="field cmp-pick">
      <span className="field-label">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {props.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal open={props.open} title="Compare drafts" onClose={props.onClose} wide>
      {from && to && comparison && (
        <div className="cmp">
          <div className="cmp-controls">
            {picker('compare-from', 'From (older)', from.id, (v) => props.onPick(v, to.id))}
            {picker('compare-to', 'To (newer)', to.id, (v) => props.onPick(from.id, v))}
          </div>
          <p className="cmp-summary" role="status">
            {comparison.added + comparison.removed + comparison.changed === 0 ? (
              'No differences.'
            ) : (
              <>
                {comparison.added > 0 && <span className="cmp-count added">+{comparison.added} added</span>}
                {comparison.removed > 0 && <span className="cmp-count removed">−{comparison.removed} removed</span>}
                {comparison.changed > 0 && <span className="cmp-count changed">{comparison.changed} changed</span>}
              </>
            )}
            <label className="cmp-toggle">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show unchanged lines
            </label>
          </p>
          <div className="cmp-scroll">
            <div className="cmp-script">
              {rows.map((row, i) =>
                row.type === 'gap' ? (
                  <button key={`gap-${i}`} className="cmp-gap" onClick={() => setShowAll(true)}>
                    {row.count} unchanged {row.count === 1 ? 'line' : 'lines'}
                  </button>
                ) : (
                  <ChangeLine key={i} change={row.change} />
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
