import { Plugin } from 'prosemirror-state';
import { detectWhileTyping } from '../../core/flow';
import { currentElement } from '../commands';

/**
 * Switches element types as you type — "int." in Action becomes a Scene
 * Heading, "(" at the start of Dialogue becomes a Parenthetical, "[[" makes
 * a Note — and keeps parentheticals' brackets automatic.
 */
export function smartTypePlugin(): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const state = view.state;
        const el = currentElement(state);
        if (from < el.contentStart || to > el.contentStart + el.node.content.size) return false;
        const before = el.text.slice(0, from - el.contentStart);
        const after = el.text.slice(to - el.contentStart);

        // Parentheses are drawn automatically around parentheticals.
        if (el.kind === 'parenthetical') {
          if (text === '(' && !before) return true;
          if (text === ')' && !after.trim()) return true;
        }

        const detected = detectWhileTyping(el.kind, before + text + after);
        if (!detected) return false;
        const tr = state.tr.insertText(text, from, to);
        tr.setNodeMarkup(el.start, undefined, { kind: detected.to });
        if (detected.strip) tr.delete(el.contentStart, el.contentStart + detected.strip);
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
}
