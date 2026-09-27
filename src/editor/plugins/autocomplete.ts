import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ScriptFormat } from '../../core/formats';
import { getSuggestions, type Suggestion } from '../../core/suggestions';
import type { ScriptElement } from '../../core/types';
import { currentElement, enterCommand } from '../commands';
import { docToElements } from '../convert';

/**
 * SmartType-style autocomplete popup for character names, scene headings,
 * transitions, acts and parentheticals.
 *
 * Keys: ↑/↓ choose · Tab accepts and stays put · Enter accepts and moves on
 * to the next element, but only once you've typed or chosen something (so
 * Enter on an empty Character line still moves on to Action) · Esc closes.
 */

export interface AutocompleteOptions {
  getFormat: () => ScriptFormat;
  /** Character names remembered across this and other scripts. */
  getMemory: () => Record<string, number>;
}

interface AcState {
  items: Suggestion[];
  selected: number;
  /** Enter accepts only when armed (the writer typed or used the arrows). */
  armed: boolean;
  /** Suppressed for this element text (after Esc or accepting). */
  suppressed: string | null;
  /** Element the list belongs to (its start position). */
  element: number;
}

export const autocompleteKey = new PluginKey<AcState>('autocomplete');

type Meta = { type: 'move'; delta: number } | { type: 'suppress'; key: string };

function contextKey(state: EditorState): string {
  const el = currentElement(state);
  return `${el.start}:${el.kind}:${el.text}`;
}

let elementsCache: { doc: unknown; elements: ScriptElement[] } | null = null;
function elementsOf(state: EditorState): ScriptElement[] {
  if (elementsCache?.doc !== state.doc) elementsCache = { doc: state.doc, elements: docToElements(state.doc) };
  return elementsCache.elements;
}

function compute(state: EditorState, options: AutocompleteOptions): Suggestion[] {
  const sel = state.selection;
  if (!sel.empty) return [];
  const el = currentElement(state);
  return getSuggestions({
    kind: el.kind,
    before: el.text.slice(0, el.offset),
    after: el.text.slice(el.offset),
    index: el.index,
    elements: elementsOf(state),
    format: options.getFormat(),
    memory: options.getMemory(),
  });
}

/** Close the list for a programmatic edit (e.g. renaming a character everywhere). */
export function closeSuggestions(tr: Transaction): Transaction {
  return tr.setMeta(autocompleteKey, { type: 'suppress', key: '' } satisfies Meta);
}

export function acceptSuggestion(view: EditorView, item: Suggestion, advance?: ScriptFormat): void {
  const { state } = view;
  const el = currentElement(state);
  const from = el.contentStart + item.from;
  const to = state.selection.from;
  const tr = state.tr.insertText(item.insert, from, to);
  tr.setSelection(TextSelection.create(tr.doc, from + item.insert.length));
  if (!item.chain) tr.setMeta(autocompleteKey, { type: 'suppress', key: '' } satisfies Meta);
  view.dispatch(tr.scrollIntoView());
  if (item.chain) return;
  if (advance) {
    enterCommand(advance)(view.state, view.dispatch);
    return;
  }
  // Keep the list closed until the text changes again.
  view.dispatch(view.state.tr.setMeta(autocompleteKey, { type: 'suppress', key: contextKey(view.state) } satisfies Meta));
}

export function autocompletePlugin(options: AutocompleteOptions): Plugin<AcState> {
  return new Plugin<AcState>({
    key: autocompleteKey,
    state: {
      init: () => ({ items: [], selected: 0, armed: false, suppressed: null, element: -1 }),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(autocompleteKey) as Meta | undefined;
        if (meta?.type === 'move') {
          const n = prev.items.length;
          if (!n) return prev;
          const selected = prev.armed ? (prev.selected + meta.delta + n) % n : meta.delta > 0 ? 0 : n - 1;
          return { ...prev, selected, armed: true };
        }
        let suppressed = prev.suppressed;
        if (meta?.type === 'suppress') suppressed = meta.key;
        const key = contextKey(state);
        if (suppressed !== null && suppressed !== key && meta?.type !== 'suppress') suppressed = null;
        const el = currentElement(state);
        const closed: AcState = { items: [], selected: 0, armed: false, suppressed, element: el.start };
        if (meta?.type === 'suppress' || suppressed === key) return closed;
        if (!tr.docChanged) {
          if (!tr.selectionSet) return prev;
          // Moving the caret never opens the list (arrow keys must keep working);
          // it only updates a list that is already open in the same element.
          if (!prev.items.length || prev.element !== el.start) return closed;
        }
        const items = compute(state, options);
        // Armed once something has been typed in the part being completed.
        const typed = items.length > 0 && el.text.slice(items[0].from, el.offset).trim().length > 0;
        return { items, selected: 0, armed: typed, suppressed, element: el.start };
      },
    },
    props: {
      handleKeyDown(view, event) {
        const ac = autocompleteKey.getState(view.state);
        if (!ac || !ac.items.length || !view.hasFocus()) return false;
        const move = (delta: number) => {
          view.dispatch(view.state.tr.setMeta(autocompleteKey, { type: 'move', delta } satisfies Meta));
          return true;
        };
        switch (event.key) {
          case 'ArrowDown':
            return move(1);
          case 'ArrowUp':
            return move(-1);
          case 'Tab':
            if (event.shiftKey) return false;
            acceptSuggestion(view, ac.items[ac.selected] ?? ac.items[0]);
            return true;
          case 'Enter':
            if (!ac.armed || event.shiftKey) return false;
            acceptSuggestion(view, ac.items[ac.selected], options.getFormat());
            return true;
          case 'Escape':
            view.dispatch(view.state.tr.setMeta(autocompleteKey, { type: 'suppress', key: contextKey(view.state) } satisfies Meta));
            return true;
          default:
            return false;
        }
      },
    },
    view(view) {
      const popup = new SuggestionPopup(view);
      return {
        update: () => popup.update(),
        destroy: () => popup.destroy(),
      };
    },
  });
}

class SuggestionPopup {
  private dom: HTMLDivElement;
  private list: HTMLUListElement;
  private hint: HTMLDivElement;
  private reposition = () => this.update();
  private blurTimer = 0;

  constructor(private view: EditorView) {
    this.dom = document.createElement('div');
    this.dom.className = 'ac-popup';
    this.dom.setAttribute('role', 'listbox');
    this.dom.hidden = true;
    this.list = document.createElement('ul');
    this.hint = document.createElement('div');
    this.hint.className = 'ac-hint';
    this.dom.append(this.list, this.hint);
    document.body.appendChild(this.dom);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    view.dom.addEventListener('blur', this.onBlur);
    view.dom.addEventListener('focus', this.reposition);
  }

  private onBlur = () => {
    window.clearTimeout(this.blurTimer);
    this.blurTimer = window.setTimeout(() => this.update(), 120);
  };

  update() {
    const ac = autocompleteKey.getState(this.view.state);
    if (!ac || !ac.items.length || !this.view.hasFocus()) {
      this.dom.hidden = true;
      return;
    }
    this.list.replaceChildren(
      ...ac.items.map((item, i) => {
        const li = document.createElement('li');
        li.className = 'ac-item';
        if (i === ac.selected) li.classList.add(ac.armed ? 'is-active' : 'is-default');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === ac.selected));
        const label = document.createElement('span');
        label.className = 'ac-label';
        label.textContent = item.label;
        li.appendChild(label);
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'ac-detail';
          detail.textContent = item.detail;
          li.appendChild(detail);
        }
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          acceptSuggestion(this.view, item);
          this.view.focus();
        });
        return li;
      }),
    );
    this.hint.textContent = ac.armed ? '↵ accept & continue · Tab accept · Esc close' : 'Tab to accept · ↓ to choose · or keep typing';
    this.dom.hidden = false;
    const coords = this.view.coordsAtPos(this.view.state.selection.from);
    const rect = this.dom.getBoundingClientRect();
    const below = coords.bottom + 4;
    const top = below + rect.height > window.innerHeight - 8 ? Math.max(8, coords.top - rect.height - 4) : below;
    const left = Math.min(Math.max(8, coords.left - 8), window.innerWidth - rect.width - 8);
    this.dom.style.top = `${top}px`;
    this.dom.style.left = `${left}px`;
  }

  destroy() {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.view.dom.removeEventListener('blur', this.onBlur);
    this.view.dom.removeEventListener('focus', this.reposition);
    window.clearTimeout(this.blurTimer);
    this.dom.remove();
  }
}
