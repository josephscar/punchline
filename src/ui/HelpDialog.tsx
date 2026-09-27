import type { ScriptFormat } from '../core/formats';
import { Modal } from './Dialogs';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
/** Element shortcuts: browsers keep Ctrl/⌘+1…9 for switching tabs, so Alt/⌥ is the one that always works. */
export const ALT = isMac ? '⌥' : 'Alt';

export function HelpDialog(props: { open: boolean; format: ScriptFormat; onClose: () => void }) {
  const { format } = props;
  const label = (k: keyof ScriptFormat['elements']) => format.elements[k].label;
  return (
    <Modal open={props.open} title="Cheat sheet" onClose={props.onClose} wide>
      <div className="help-grid">
        <section>
          <h3 className="section-title">Elements</h3>
          <table className="help-table">
            <thead>
              <tr>
                <th scope="col">Element</th>
                <th scope="col">Shortcut</th>
                <th scope="col">Enter →</th>
                <th scope="col">Tab (empty) →</th>
              </tr>
            </thead>
            <tbody>
              {format.elementOrder.map((k) => {
                const tab = format.flow.tab[k];
                return (
                  <tr key={k}>
                    <th scope="row">
                      {label(k)}
                      <span className="help-sub">{format.elements[k].hint}</span>
                    </th>
                    <td>
                      <kbd>{ALT}</kbd>+<kbd>{format.elements[k].shortcut}</kbd>
                    </td>
                    <td>{label(format.flow.enter[k])}</td>
                    <td>{tab ? label(tab) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="section-title">Writing fast</h3>
          <ul className="help-list">
            <li>
              <b>Enter</b> moves to the next element: Character → Dialogue → Character… Press Enter on an empty line to switch it (empty Character → Action, empty Action → Scene Heading).
            </li>
            <li>
              <b>Tab</b> in empty Action makes a Character; in Dialogue it adds a (parenthetical) — even mid-speech. <b>Shift+Tab</b> goes back.
            </li>
            <li>
              <b>Character names are remembered.</b> On a new Character line the list predicts who speaks next — press <kbd>Tab</kbd> to take it, or type a letter or two and press <kbd>Enter</kbd>.
            </li>
            <li>
              Scene headings complete in three steps: <b>INT./EXT.</b> → locations you’ve used → time of day.
            </li>
            <li>
              Just type: <code>int.</code> becomes a Scene Heading, <code>cut to:</code> a Transition, <code>(</code> in dialogue a Parenthetical, <code>[[</code> a Note, <code>ACT TWO</code> a New Act.
            </li>
            <li>
              <kbd>{ALT}</kbd>+<kbd>1</kbd>…<kbd>0</kbd> switch element (also <kbd>{MOD}</kbd>+number where the browser allows) · <kbd>{MOD}</kbd>+<kbd>B</kbd>/<kbd>I</kbd>/<kbd>U</kbd> bold, italic, underline · <kbd>Shift</kbd>+<kbd>Enter</kbd> line break · <kbd>{MOD}</kbd>+<kbd>Z</kbd> undo · <kbd>{MOD}</kbd>+<kbd>P</kbd> PDF · <kbd>{MOD}</kbd>+<kbd>/</kbd> this sheet.
            </li>
          </ul>
          <h3 className="section-title">Single-cam sitcom format</h3>
          <ul className="help-list">
            <li>Laid out like a feature screenplay: 12pt Courier, mixed-case action, single-spaced dialogue, 1.5″ left margin.</li>
            <li>
              Structure: <b>COLD OPEN</b> (or TEASER), <b>ACT ONE</b>, <b>ACT TWO</b> (sometimes three or four), and a <b>TAG</b>. Each act starts on a new page, centered, bold and underlined, and ends with <b>END OF ACT …</b>; the last one is <b>END OF SHOW</b>.
            </li>
            <li>About a page a minute: a half-hour single-cam usually runs 25–35 pages.</li>
            <li>Scene headings: INT. or EXT., the location, then the time (DAY, NIGHT, CONTINUOUS, LATER). Shots such as ANGLE ON or BACK TO SCENE go in the Shot element.</li>
            <li>Transitions (CUT TO:, SMASH CUT TO:) sit flush right. Single-cam comedies use them sparingly — SMASH CUT TO: is the classic joke button.</li>
            <li>(MORE) and (CONT’D) are added automatically when a speech breaks across pages.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
