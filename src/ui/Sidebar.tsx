import { useMemo, useState, type ReactNode } from 'react';
import type { ScriptAnalysis, SceneInfo } from '../core/analysis';
import { icons } from './icons';

export type SidebarTab = 'scenes' | 'characters' | 'notes' | 'drafts';

interface Props {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  analysis: ScriptAnalysis;
  elementPages: number[];
  cursorIndex: number;
  /** Names this script remembers but no longer uses. */
  rememberedHere: string[];
  /** Names used in the writer's other scripts (in the same project). */
  rememberedElsewhere: string[];
  /** Heading for `rememberedElsewhere`. */
  elsewhereLabel: string;
  /** The Drafts tab's content and how many drafts there are. */
  drafts: ReactNode;
  draftCount: number;
  showSceneNumbers: boolean;
  onGo: (index: number) => void;
  onRename: (name: string) => void;
  onForget: (name: string) => void;
  onAddNote: () => void;
  /** Move the scene at `from` before element `target`, or to the end of the act at `actEnd`. */
  onMoveScene: (from: number, target: number | { actEnd: number }) => void;
}

interface DragProps {
  dragging: number | null;
  dropTarget: string | null;
  setDragging: (index: number | null) => void;
  setDropTarget: (key: string | null) => void;
  onMove: (target: number | { actEnd: number }) => void;
}

function SceneRow({
  scene,
  page,
  current,
  onGo,
  numbered,
  drag,
}: {
  scene: SceneInfo;
  page: number;
  current: boolean;
  onGo: () => void;
  numbered: boolean;
  drag: DragProps;
}) {
  const key = `scene-${scene.index}`;
  return (
    <li
      draggable
      className={drag.dropTarget === key ? 'drop-before' : undefined}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', scene.heading);
        drag.setDragging(scene.index);
      }}
      onDragEnd={() => {
        drag.setDragging(null);
        drag.setDropTarget(null);
      }}
      onDragOver={(e) => {
        if (drag.dragging === null || drag.dragging === scene.index) return;
        e.preventDefault();
        drag.setDropTarget(key);
      }}
      onDragLeave={() => drag.setDropTarget(null)}
      onDrop={(e) => {
        e.preventDefault();
        drag.onMove(scene.index);
      }}
    >
      <button className={`nav-scene${current ? ' is-current' : ''}`} onClick={onGo} aria-current={current ? 'true' : undefined}>
        <span className="nav-scene-num">{numbered ? scene.number : ''}</span>
        <span className="nav-scene-body">
          <span className="nav-scene-heading">{scene.heading}</span>
          {scene.synopsis && <span className="nav-scene-synopsis">{scene.synopsis}</span>}
          {scene.characters.length > 0 && <span className="nav-scene-cast">{scene.characters.join(', ')}</span>}
        </span>
        <span className="nav-page" title={`Page ${page}`}>
          {page}
        </span>
      </button>
    </li>
  );
}

export function Sidebar(props: Props) {
  const { tab, onTab, analysis, elementPages, cursorIndex, onGo } = props;
  const [cueCursor, setCueCursor] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag: DragProps = {
    dragging,
    dropTarget,
    setDragging,
    setDropTarget,
    onMove: (target) => {
      if (dragging !== null) props.onMoveScene(dragging, target);
      setDragging(null);
      setDropTarget(null);
    },
  };

  const currentScene = useMemo(() => {
    let current = -1;
    for (const s of analysis.scenes) if (s.index <= cursorIndex) current = s.index;
    return current;
  }, [analysis.scenes, cursorIndex]);

  const scenesPanel = (
    <div className="nav-panel">
      {analysis.scenes.length === 0 && analysis.acts.length === 0 && (
        <p className="nav-empty">Scenes appear here as you write scene headings (INT. / EXT.).</p>
      )}
      {analysis.looseScenes.length > 0 && (
        <ul className="nav-list">
          {analysis.looseScenes.map((s) => (
            <SceneRow key={s.index} scene={s} page={elementPages[s.index] ?? 1} current={s.index === currentScene} onGo={() => onGo(s.index)} numbered={props.showSceneNumbers} drag={drag} />
          ))}
        </ul>
      )}
      {analysis.scenes.length > 1 && <p className="nav-hint">Drag scenes to reorder them.</p>}
      {analysis.acts.map((act) => (
        <section key={act.index} className="nav-act">
          <button className="nav-act-title" onClick={() => onGo(act.index)}>
            <span>{act.name}</span>
            <span className="nav-page">{elementPages[act.index] ?? 1}</span>
          </button>
          {act.scenes.length ? (
            <ul className="nav-list">
              {act.scenes.map((s) => (
                <SceneRow key={s.index} scene={s} page={elementPages[s.index] ?? 1} current={s.index === currentScene} onGo={() => onGo(s.index)} numbered={props.showSceneNumbers} drag={drag} />
              ))}
            </ul>
          ) : (
            <p className="nav-empty">No scenes yet.</p>
          )}
          {dragging !== null && (
            <div
              className={`drop-zone${dropTarget === `act-${act.index}` ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(`act-${act.index}`);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                drag.onMove({ actEnd: act.index });
              }}
            >
              Move to end of {act.name}
            </div>
          )}
        </section>
      ))}
    </div>
  );

  const nextCue = (name: string, cues: number[]) => {
    const i = ((cueCursor[name] ?? -1) + 1) % cues.length;
    setCueCursor({ ...cueCursor, [name]: i });
    onGo(cues[i]);
  };

  const charactersPanel = (
    <div className="nav-panel">
      {analysis.characters.length === 0 && <p className="nav-empty">Characters appear here once they speak. Names are remembered and suggested as you type.</p>}
      {analysis.characters.length > 0 && (
        <table className="cast-table">
          <thead>
            <tr>
              <th scope="col">Character</th>
              <th scope="col" title="Speeches">Lines</th>
              <th scope="col" title="Scenes">Sc.</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {analysis.characters.map((c) => (
              <tr key={c.name}>
                <td>
                  <button className="cast-name" onClick={() => nextCue(c.name, c.cues)} title="Jump to their next line">
                    {c.name}
                  </button>
                </td>
                <td className="num">{c.speeches}</td>
                <td className="num">{c.scenes}</td>
                <td className="num">
                  <button className="icon-btn small" onClick={() => props.onRename(c.name)} title={`Rename ${c.name} everywhere`} aria-label={`Rename ${c.name}`}>
                    {icons.edit()}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.rememberedHere.length > 0 && (
        <section className="remembered">
          <h3>Remembered in this script</h3>
          <p className="nav-hint">Still suggested when you type a character name.</p>
          <ul>
            {props.rememberedHere.map((n) => (
              <li key={n}>
                <span>{n}</span>
                <button className="link-btn" onClick={() => props.onForget(n)}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {props.rememberedElsewhere.length > 0 && (
        <section className="remembered">
          <h3>{props.elsewhereLabel}</h3>
          <p className="nav-hint">Recurring cast, suggested here too.</p>
          <ul className="chips">
            {props.rememberedElsewhere.map((n) => (
              <li key={n} className="chip">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const notesPanel = (
    <div className="nav-panel">
      <button className="btn btn-quiet full" onClick={props.onAddNote}>
        {icons.plus()} Add note below cursor
      </button>
      {analysis.notes.length === 0 && <p className="nav-empty">No notes yet. Type [[ on an empty line or press Alt/⌥+0. Notes are never printed.</p>}
      <ul className="nav-list">
        {analysis.notes.map((n) => (
          <li key={n.index}>
            <button className="nav-note" onClick={() => onGo(n.index)}>
              <span className="nav-note-text">{n.text}</span>
              <span className="nav-note-meta">
                {n.scene || 'Before first scene'} · p. {elementPages[n.index] ?? 1}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const tabs: { id: SidebarTab; label: string; count: number }[] = [
    { id: 'scenes', label: 'Scenes', count: analysis.scenes.length },
    { id: 'characters', label: 'Characters', count: analysis.characters.length },
    { id: 'notes', label: 'Notes', count: analysis.notes.length },
    { id: 'drafts', label: 'Drafts', count: props.draftCount },
  ];

  return (
    <aside className="sidebar" aria-label="Script navigator">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' is-active' : ''}`} onClick={() => onTab(t.id)}>
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="tab-body">
        {tab === 'scenes' && scenesPanel}
        {tab === 'characters' && charactersPanel}
        {tab === 'notes' && notesPanel}
        {tab === 'drafts' && props.drafts}
      </div>
    </aside>
  );
}
