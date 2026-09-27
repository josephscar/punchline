import { nextInCycle } from '../core/flow';
import type { ScriptFormat } from '../core/formats';
import { Modal } from './Dialogs';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
/** Element shortcuts: browsers keep Ctrl/⌘+1…9 for switching tabs, so Alt/⌥ is the one that always works. */
export const ALT = isMac ? '⌥' : 'Alt';

const STRUCTURE: Record<string, string> = {
  'single-cam-sitcom':
    'COLD OPEN, ACT ONE, ACT TWO (sometimes three or four) and a TAG. Each act starts on a new page, centered, bold and underlined, and ends with END OF ACT …; the last one is END OF SHOW. Usually 25–35 pages.',
  'one-hour-drama':
    'TEASER and ACT ONE to ACT FIVE (network shows use four to six), each on a new page and closed with END OF …; the last is END OF EPISODE. Usually 50–65 pages.',
  'feature-screenplay': 'No act headings: FADE IN: at the left margin to open, FADE OUT. flush right to close. Usually 90–120 pages.',
};

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
                <th scope="col">Tab →</th>
              </tr>
            </thead>
            <tbody>
              {format.elementOrder.map((k) => {
                const tab = nextInCycle(format, k);
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
                    <td>{label(tab)}</td>
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
              <b>Tab</b> changes the current line to the next element type, in the order of this table (Action → Character → Parenthetical → Dialogue → Transition…). <b>Shift+Tab</b> goes back one.
            </li>
            <li>
              <b>Character names are remembered.</b> On a new Character line the list predicts who speaks next, with the likeliest first. Click a name to use it, or pick with <kbd>↓</kbd> and <kbd>Enter</kbd>. Nothing is chosen for you.
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
          <h3 className="section-title">{format.name} format</h3>
          <ul className="help-list">
            <li>Screenplay page: 12pt Courier, mixed-case action, single-spaced dialogue, 1.5″ left margin. About a page a minute.</li>
            {STRUCTURE[format.id] && <li>{STRUCTURE[format.id]}</li>}
            <li>Scene headings: INT. or EXT., the location, then the time (DAY, NIGHT, CONTINUOUS, LATER). Shots such as ANGLE ON or BACK TO SCENE go in the Shot element.</li>
            <li>Transitions (CUT TO:, SMASH CUT TO:) sit flush right. Use them sparingly.</li>
            <li>(MORE) and (CONT’D) are added automatically when a speech breaks across pages.</li>
          </ul>
          <h3 className="section-title">Drafts</h3>
          <ul className="help-list">
            <li>
              In the navigator’s <b>Drafts</b> tab, <b>Save draft</b> keeps a copy of the pages as they are. Compare it with now, restore it, or start a new script from it.
            </li>
            <li>
              Set <b>Revision marks</b> to a draft to put a <b>*</b> beside every line changed since, on screen and in the PDF.
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
