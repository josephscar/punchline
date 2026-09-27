import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ScriptFormat } from '../../core/formats';
import { layoutScript, type ScriptLayout } from '../../core/layout/paginate';
import { revisedIndices } from '../../core/diff';
import type { ScriptElement, ScriptSettings } from '../../core/types';
import { docToElements } from '../convert';

/**
 * Keeps a live pagination of the document and draws what it implies right
 * in the editor: page-break markers with page numbers, automatic (CONT'D)
 * after character names, scene numbers, placeholders in empty elements and
 * a label in the margin naming the current element.
 */

export interface LayoutOptions {
  getFormat: () => ScriptFormat;
  getSettings: () => ScriptSettings;
  /** Pages of the draft chosen for revision marks, if any. */
  getBaseline: () => ScriptElement[] | null;
}

export interface LayoutState {
  elements: ScriptElement[];
  layout: ScriptLayout;
  /** Elements changed since the revision baseline. */
  revised: Set<number>;
  /** `revised` is from an earlier version of the document and is being recomputed. */
  stale: boolean;
}

export const layoutKey = new PluginKey<LayoutState>('layout');

type LayoutMeta = { refresh: true } | { revised: Set<number>; doc: unknown };

/** Dispatch a transaction with this meta to re-run layout after settings change. */
export const REFRESH_LAYOUT: LayoutMeta = { refresh: true };

/** Revision diffs slower than this run after typing pauses instead of on every keystroke. */
const REVISION_BUDGET_MS = 5;
const REVISION_DELAY_MS = 300;

function pageBreakWidget(page: number, topEm: number) {
  return () => {
    const dom = document.createElement('span');
    dom.className = 'pl-page-break';
    dom.contentEditable = 'false';
    dom.setAttribute('aria-hidden', 'true');
    dom.style.top = `${topEm}em`;
    const label = document.createElement('span');
    label.className = 'pl-page-number';
    label.textContent = `${page}.`;
    dom.appendChild(label);
    return dom;
  };
}

function labelWidget(text: string) {
  return () => {
    const dom = document.createElement('span');
    dom.className = 'pl-el-label';
    dom.contentEditable = 'false';
    dom.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.textContent = text;
    dom.appendChild(inner);
    return dom;
  };
}

function revisionWidget() {
  const dom = document.createElement('span');
  dom.className = 'pl-rev-mark';
  dom.contentEditable = 'false';
  dom.title = 'Changed since the draft chosen for revision marks';
  dom.textContent = '*';
  return dom;
}

function contdWidget(text: string) {
  return () => {
    const dom = document.createElement('span');
    dom.className = 'pl-contd';
    dom.contentEditable = 'false';
    dom.textContent = ` ${text}`;
    return dom;
  };
}

/** Blank lines the editor shows above an element (acts get extra room). */
export function editorSpaceBefore(format: ScriptFormat, kind: keyof ScriptFormat['elements']): number {
  const style = format.elements[kind];
  return style.startsPage ? 3 : style.spaceBefore;
}

export function layoutPlugin(options: LayoutOptions): Plugin<LayoutState> {
  // How long the last revision diff took; big, heavily rewritten scripts are
  // diffed once typing pauses so keystrokes stay instant.
  let revisionCost = 0;
  const revisionsFor = (elements: ScriptElement[]) => {
    const baseline = options.getBaseline();
    if (!baseline) return new Set<number>();
    const start = performance.now();
    const revised = revisedIndices(baseline, elements);
    revisionCost = performance.now() - start;
    return revised;
  };

  const compute = (state: EditorState, prev: LayoutState | null, meta: LayoutMeta | undefined, docChanged: boolean): LayoutState => {
    const elements = docToElements(state.doc);
    let revised: Set<number>;
    let stale = false;
    if (meta && 'revised' in meta && meta.doc === state.doc) revised = meta.revised;
    else if (!options.getBaseline()) revised = new Set();
    else if (!prev || !docChanged || revisionCost < REVISION_BUDGET_MS) revised = revisionsFor(elements);
    else {
      revised = prev.revised;
      stale = true;
    }
    const layout = layoutScript({ elements, settings: options.getSettings() }, options.getFormat(), { revised });
    return { elements, revised, stale, layout };
  };

  return new Plugin<LayoutState>({
    key: layoutKey,
    state: {
      init: (_, state) => compute(state, null, undefined, false),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(layoutKey) as LayoutMeta | undefined;
        if (tr.docChanged || meta) return compute(state, prev, meta, tr.docChanged);
        return prev;
      },
    },
    view() {
      let timer = 0;
      return {
        update(view) {
          const data = layoutKey.getState(view.state);
          if (!data?.stale) return;
          window.clearTimeout(timer);
          const doc = view.state.doc;
          timer = window.setTimeout(() => {
            if (view.state.doc !== doc) return;
            const revised = revisionsFor(data.elements);
            view.dispatch(view.state.tr.setMeta(layoutKey, { revised, doc } satisfies LayoutMeta));
          }, REVISION_DELAY_MS);
        },
        destroy() {
          window.clearTimeout(timer);
        },
      };
    },
    props: {
      decorations(state) {
        const data = layoutKey.getState(state);
        if (!data) return null;
        const format = options.getFormat();
        const settings = options.getSettings();
        const { layout } = data;
        const decorations: Decoration[] = [];
        const pageAt = new Map<number, { page: number; line: number }[]>();
        for (const ps of layout.pageStarts) {
          const list = pageAt.get(ps.elementIndex) ?? [];
          list.push({ page: ps.page, line: ps.lineInElement });
          pageAt.set(ps.elementIndex, list);
        }
        const { $from } = state.selection;
        const currentIndex = $from.index(0);
        state.doc.forEach((node, pos, index) => {
          const kind = node.attrs.kind as keyof ScriptFormat['elements'];
          const contentStart = pos + 1;
          const attrs: Record<string, string> = {};
          if (!node.content.size) {
            attrs.class = index === currentIndex ? 'is-empty is-current' : 'is-empty';
            attrs['data-placeholder'] = format.elements[kind]?.placeholder ?? '';
          } else if (index === currentIndex) {
            attrs.class = 'is-current';
          }
          if (settings.sceneNumbers && layout.sceneNumbers.has(index)) attrs['data-scene'] = String(layout.sceneNumbers.get(index));
          if (Object.keys(attrs).length) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));

          for (const { page, line } of pageAt.get(index) ?? []) {
            const top = line === 0 ? -editorSpaceBefore(format, kind) / 2 : line;
            decorations.push(
              Decoration.widget(contentStart, pageBreakWidget(page, top), {
                side: -1,
                key: `pb-${page}-${line}-${top}`,
                ignoreSelection: true,
              }),
            );
          }
          if (index === currentIndex && format.elements[kind]) {
            decorations.push(
              Decoration.widget(contentStart, labelWidget(format.elements[kind].label), {
                side: -2,
                key: `label-${kind}`,
                ignoreSelection: true,
              }),
            );
          }
          if (data.revised.has(index)) {
            decorations.push(Decoration.widget(contentStart, revisionWidget, { side: -1, key: 'rev', ignoreSelection: true }));
          }
          if (layout.contdCues.has(index) && node.content.size) {
            decorations.push(
              Decoration.widget(contentStart + node.content.size, contdWidget(format.contd), {
                side: 1,
                key: 'contd',
                ignoreSelection: true,
              }),
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
