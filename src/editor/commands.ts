import { NodeSelection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { detectOnEnter, enterAction, tabAction, type FlowAction } from '../core/flow';
import type { ScriptFormat } from '../core/formats';
import type { ElementKind } from '../core/types';
import { schema } from './schema';

/** The element the cursor is in, with handy positions. */
export function currentElement(state: EditorState) {
  const { $from } = state.selection;
  const node = $from.node(1);
  const start = $from.before(1);
  return {
    node,
    kind: node.attrs.kind as ElementKind,
    index: $from.index(0),
    /** Position before the element's opening token. */
    start,
    /** Position of the first character. */
    contentStart: start + 1,
    offset: $from.pos - (start + 1),
    text: node.textContent,
  };
}

/** Change every element touched by the selection to `kind`. */
export function setKind(kind: ElementKind): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.element) {
        if (node.attrs.kind !== kind) tr.setNodeMarkup(pos, undefined, { kind });
        return false;
      }
      return true;
    });
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function elementType(kind: ElementKind) {
  return { type: schema.nodes.element, attrs: { kind } };
}

function applyFlow(tr: Transaction, action: FlowAction, start: number, cursor: number): boolean {
  switch (action.type) {
    case 'convert':
      tr.setNodeMarkup(start, undefined, { kind: action.to });
      return true;
    case 'split':
      tr.split(cursor, 1, [elementType(action.to)]);
      tr.setStoredMarks([]);
      return true;
    case 'insertAbove': {
      const node = tr.doc.nodeAt(start)!;
      tr.insert(start, schema.nodes.element.create({ kind: node.attrs.kind }));
      return true;
    }
    case 'splitWith': {
      tr.split(cursor, 1, [elementType(action.rest)]);
      // After the split the first element closes at `cursor`; slot the new one in between.
      tr.insert(cursor + 1, schema.nodes.element.create({ kind: action.insert }));
      tr.setSelection(TextSelection.create(tr.doc, cursor + 2));
      return true;
    }
    case 'none':
      return false;
  }
}

/** Enter: move to the next element in the flow (Scene Heading → Action → …). */
export function enterCommand(format: ScriptFormat): Command {
  return (state, dispatch) => {
    let tr = state.tr;
    if (state.selection instanceof NodeSelection) {
      // A whole element is selected: continue from its end rather than deleting it.
      const end = state.selection.from + state.selection.node.nodeSize - 1;
      tr = tr.setSelection(TextSelection.create(state.doc, end));
    } else if (!state.selection.empty) {
      tr = tr.deleteSelection();
    }
    const probe = state.apply(tr);
    const el = currentElement(probe);
    let kind = el.kind;
    // "INT. OFFICE - " → drop the dangling dash left over from autocomplete.
    if (kind === 'scene_heading' && el.offset >= el.text.length) {
      const m = /\s*[-–—]\s*$/.exec(el.text);
      if (m && m.index > 0) {
        tr.delete(el.contentStart + m.index, el.contentStart + el.text.length);
        return finish(tr, format, el.start, el.contentStart + m.index, el.text.slice(0, m.index), kind, dispatch);
      }
    }
    if (el.offset >= el.text.trimEnd().length) {
      const detected = detectOnEnter(format, kind, el.text);
      if (detected) {
        tr.setNodeMarkup(el.start, undefined, { kind: detected });
        kind = detected;
      }
    }
    return finish(tr, format, el.start, probe.selection.from, el.text, kind, dispatch, el.offset);
  };
}

function finish(
  tr: Transaction,
  format: ScriptFormat,
  start: number,
  cursor: number,
  text: string,
  kind: ElementKind,
  dispatch: ((tr: Transaction) => void) | undefined,
  offset = text.length,
): boolean {
  applyFlow(tr, enterAction(format, kind, text, offset), start, cursor);
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

/** Tab / Shift+Tab: cycle an empty element, or add the natural next element. */
export function tabCommand(format: ScriptFormat, shift: boolean): Command {
  return (state, dispatch) => {
    const el = currentElement(state);
    const action = tabAction(format, el.kind, el.text, el.offset, shift);
    const tr = state.tr;
    applyFlow(tr, action, el.start, state.selection.from);
    // Always swallow Tab so focus never leaves the page.
    if (dispatch && tr.docChanged) dispatch(tr.scrollIntoView());
    return true;
  };
}

export function insertHardBreak(): Command {
  return (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
    return true;
  };
}

/** Put the cursor at the end of the element at `index`. */
export function selectElement(state: EditorState, index: number): Transaction | null {
  if (index < 0 || index >= state.doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  const node = state.doc.child(index);
  return state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + node.content.size)).scrollIntoView();
}

/** Ctrl/⌘+Home and +End: jump to the start or end of the script. */
export function jumpTo(where: 'start' | 'end'): Command {
  return (state, dispatch) => {
    const sel = where === 'start' ? TextSelection.atStart(state.doc) : TextSelection.atEnd(state.doc);
    if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
    return true;
  };
}
