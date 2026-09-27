import { Schema } from 'prosemirror-model';
import { isElementKind } from '../core/types';

/**
 * One node type — `element` — with a `kind` attribute, rather than a node
 * type per element. Changing an element's type is then a simple attribute
 * change, and new formats can add kinds without touching the schema.
 */
export const schema = new Schema({
  nodes: {
    doc: { content: 'element+' },
    element: {
      attrs: { kind: { default: 'action' } },
      content: 'inline*',
      marks: '_',
      parseDOM: [
        {
          tag: 'p[data-kind]',
          getAttrs: (dom) => {
            const kind = (dom as HTMLElement).getAttribute('data-kind');
            return { kind: isElementKind(kind) ? kind : 'action' };
          },
        },
        { tag: 'p', attrs: { kind: 'action' } },
      ],
      toDOM: (node) => ['p', { class: 'pl-el', 'data-kind': node.attrs.kind }, 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    underline: {
      parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
      toDOM: () => ['u', 0],
    },
  },
});
