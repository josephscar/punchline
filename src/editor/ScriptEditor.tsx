import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Slice } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { ScriptFormat } from '../core/formats';
import type { ScriptLayout } from '../core/layout/paginate';
import { parseFountain, serializeFountain } from '../core/io/fountain';
import { emptyTitlePage, type ElementKind, type ScriptElement, type ScriptSettings } from '../core/types';
import { currentElement, enterCommand, insertHardBreak, jumpTo, selectElement, setKind, tabCommand } from './commands';
import { docToElements, elementsToDoc, nodeToElement } from './convert';
import { formatCss } from './formatCss';
import { autocompleteKey, autocompletePlugin, closeSuggestions } from './plugins/autocomplete';
import { layoutKey, layoutPlugin, REFRESH_LAYOUT } from './plugins/layout';
import { smartTypePlugin } from './plugins/smartType';
import { schema } from './schema';

export interface CursorInfo {
  kind: ElementKind;
  index: number;
  page: number;
  /** The current element has no text. */
  empty: boolean;
  /** The autocomplete list is showing (Tab accepts). */
  suggesting: boolean;
}

export interface ScriptEditorHandle {
  focus(): void;
  setKind(kind: ElementKind): void;
  toggleMark(mark: 'bold' | 'italic' | 'underline'): void;
  undo(): void;
  redo(): void;
  goToElement(index: number): void;
  getElements(): ScriptElement[];
  /** Replace the whole document (e.g. after renaming a character). */
  replaceElements(elements: ScriptElement[]): void;
  /** Add an empty element after the one with the cursor and move into it. */
  insertElement(kind: ElementKind): void;
}

interface Props {
  /** Changing this key loads `initialElements` as a fresh document. */
  docKey: string;
  initialElements: ScriptElement[];
  format: ScriptFormat;
  settings: ScriptSettings;
  memory: Record<string, number>;
  /** Called (debounced) with the document and the `docKey` it belongs to. */
  onChange: (elements: ScriptElement[], docKey: string) => void;
  onLayout: (layout: ScriptLayout) => void;
  onCursor: (cursor: CursorInfo) => void;
  /** Extra shortcuts handled by the app (save, export…). */
  onShortcut?: (name: Shortcut) => void;
  ref?: Ref<ScriptEditorHandle>;
}

const CHANGE_DELAY = 250;

function textToSlice(text: string, plain: boolean): Slice {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (plain || !normalized.includes('\n')) {
    const lines = normalized.split('\n').map((line) => ({ kind: 'action' as const, runs: line ? [{ text: line }] : [] }));
    return new Slice(elementsToDoc(lines).content, 1, 1);
  }
  const { elements } = parseFountain(normalized, { titlePage: false });
  return new Slice(elementsToDoc(elements).content, 1, 1);
}

function sliceToText(slice: Slice, format: ScriptFormat): string {
  const elements: ScriptElement[] = [];
  slice.content.forEach((node) => {
    if (node.type === schema.nodes.element) elements.push(nodeToElement(node));
  });
  if (elements.length < 2) return slice.content.textBetween(0, slice.content.size, '\n\n', '\n');
  return serializeFountain({ titlePage: emptyTitlePage(), elements }, format).trim();
}

export type Shortcut = 'save' | 'print' | 'help';

export function ScriptEditor(props: Props) {
  const { docKey, initialElements, format, settings, memory, ref } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Plugins read live values through refs so they never need rebuilding.
  const live = useRef({ format, settings, memory, props });
  live.current = { format, settings, memory, props };

  const css = useMemo(() => formatCss(format), [format]);
  const loadedKey = useRef(docKey);

  const createState = (elements: ScriptElement[]) => {
    const getFormat = () => live.current.format;
    const run = (cmd: (f: ScriptFormat) => Command): Command => (state, dispatch, view) => cmd(getFormat())(state, dispatch, view);
    const shortcut = (name: Shortcut): Command => () => {
      live.current.props.onShortcut?.(name);
      return true;
    };
    const kindKeys: Record<string, Command> = {};
    for (const kind of live.current.format.elementOrder) {
      const key = live.current.format.elements[kind].shortcut;
      kindKeys[`Mod-${key}`] = setKind(kind);
      kindKeys[`Alt-${key}`] = setKind(kind);
    }
    return EditorState.create({
      doc: elementsToDoc(elements),
      plugins: [
        autocompletePlugin({ getFormat, getMemory: () => live.current.memory }),
        smartTypePlugin(),
        history(),
        keymap({
          Enter: run(enterCommand),
          Tab: run((f) => tabCommand(f, false)),
          'Shift-Tab': run((f) => tabCommand(f, true)),
          'Shift-Enter': insertHardBreak(),
          'Mod-Home': jumpTo('start'),
          'Mod-End': jumpTo('end'),
          'Mod-z': undo,
          'Mod-y': redo,
          'Shift-Mod-z': redo,
          'Mod-b': toggleMark(schema.marks.bold),
          'Mod-i': toggleMark(schema.marks.italic),
          'Mod-u': toggleMark(schema.marks.underline),
          'Mod-s': shortcut('save'),
          'Mod-p': shortcut('print'),
          // baseKeymap would select the whole element, and the next Enter would delete it.
          Escape: () => true,
          'Mod-/': shortcut('help'),
          ...kindKeys,
        }),
        keymap(baseKeymap),
        layoutPlugin({ getFormat, getSettings: () => live.current.settings }),
      ],
    });
  };

  // Create the view once.
  useEffect(() => {
    let changeTimer = 0;
    let layoutTimer = 0;
    const reportCursor = (state: EditorState) => {
      const el = currentElement(state);
      const layout = layoutKey.getState(state)?.layout;
      live.current.props.onCursor({
        kind: el.kind,
        index: el.index,
        page: layout?.elementPages[el.index] ?? 1,
        empty: !el.text.trim(),
        suggesting: (autocompleteKey.getState(state)?.items.length ?? 0) > 0,
      });
    };
    const reportLayout = (state: EditorState) => {
      window.clearTimeout(layoutTimer);
      layoutTimer = window.setTimeout(() => {
        const data = layoutKey.getState(state);
        if (data) live.current.props.onLayout(data.layout);
      }, 60);
    };
    const view = new EditorView(mountRef.current!, {
      state: createState(initialElements),
      attributes: { class: 'pl-editor', spellcheck: 'true', 'aria-label': 'Script', role: 'textbox', 'aria-multiline': 'true' },
      // Pasted plain text is read as Fountain, so scripts from other apps keep their elements.
      clipboardTextParser: (text, _$context, plain) => textToSlice(text, plain),
      // Copied text is written as Fountain, which other screenwriting apps understand.
      clipboardTextSerializer: (slice) => sliceToText(slice, live.current.format),
      dispatchTransaction(tr) {
        const state = view.state.apply(tr);
        view.updateState(state);
        if (tr.docChanged) {
          window.clearTimeout(changeTimer);
          const key = loadedKey.current;
          changeTimer = window.setTimeout(() => {
            if (key === loadedKey.current) live.current.props.onChange(docToElements(view.state.doc), key);
          }, CHANGE_DELAY);
        }
        if (tr.docChanged || tr.getMeta(layoutKey)) reportLayout(view.state);
        // Layout refreshes also follow loading another script, so report the cursor then too.
        if (tr.docChanged || tr.selectionSet || tr.getMeta(autocompleteKey) || tr.getMeta(layoutKey)) reportCursor(view.state);
      },
    });
    viewRef.current = view;
    reportLayout(view.state);
    reportCursor(view.state);
    return () => {
      window.clearTimeout(changeTimer);
      window.clearTimeout(layoutTimer);
      // Flush pending edits so nothing typed in the last moment is lost.
      live.current.props.onChange(docToElements(view.state.doc), loadedKey.current);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a different script.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || loadedKey.current === docKey) return;
    loadedKey.current = docKey;
    view.updateState(createState(initialElements));
    view.dispatch(view.state.tr.setMeta(layoutKey, REFRESH_LAYOUT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Re-run layout when settings or format change.
  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch(view.state.tr.setMeta(layoutKey, REFRESH_LAYOUT));
  }, [settings, format]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      setKind(kind) {
        const view = viewRef.current;
        if (!view) return;
        setKind(kind)(view.state, view.dispatch);
        view.focus();
      },
      toggleMark(mark) {
        const view = viewRef.current;
        if (!view) return;
        toggleMark(schema.marks[mark])(view.state, view.dispatch);
        view.focus();
      },
      undo() {
        const view = viewRef.current;
        if (view) undo(view.state, view.dispatch);
      },
      redo() {
        const view = viewRef.current;
        if (view) redo(view.state, view.dispatch);
      },
      goToElement(index) {
        const view = viewRef.current;
        if (!view) return;
        const tr = selectElement(view.state, index);
        if (!tr) return;
        view.dispatch(tr);
        view.focus();
        const { node } = view.domAtPos(view.state.selection.from);
        const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest('.pl-el');
        el?.scrollIntoView({ block: 'center' });
      },
      getElements: () => (viewRef.current ? docToElements(viewRef.current.state.doc) : []),
      insertElement(kind) {
        const view = viewRef.current;
        if (!view) return;
        const el = currentElement(view.state);
        const at = el.start + el.node.nodeSize;
        const tr = view.state.tr.insert(at, schema.nodes.element.create({ kind }));
        tr.setSelection(TextSelection.create(tr.doc, at + 1));
        view.dispatch(tr.scrollIntoView());
        view.focus();
      },
      replaceElements(elements) {
        const view = viewRef.current;
        if (!view) return;
        const doc = elementsToDoc(elements);
        view.dispatch(closeSuggestions(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)));
      },
    }),
    [],
  );

  return (
    <div className="pl-paper-wrap">
      <style>{css}</style>
      <div className="pl-page" ref={mountRef} />
    </div>
  );
}
