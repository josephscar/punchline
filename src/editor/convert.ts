import type { Mark, Node as PMNode } from 'prosemirror-model';
import { normalizeRuns, type ElementKind, type ScriptElement, type TextRun } from '../core/types';
import { schema } from './schema';

/** Script elements → ProseMirror document. "\n" becomes a hard break. */
export function elementsToDoc(elements: ScriptElement[]): PMNode {
  const nodes = (elements.length ? elements : [{ kind: 'action' as ElementKind, runs: [] }]).map((el) => {
    const inline: PMNode[] = [];
    for (const run of el.runs) {
      const marks: Mark[] = [];
      if (run.bold) marks.push(schema.marks.bold.create());
      if (run.italic) marks.push(schema.marks.italic.create());
      if (run.underline) marks.push(schema.marks.underline.create());
      run.text.split('\n').forEach((part, i) => {
        if (i > 0) inline.push(schema.nodes.hard_break.create());
        if (part) inline.push(schema.text(part, marks));
      });
    }
    return schema.nodes.element.create({ kind: el.kind }, inline);
  });
  return schema.nodes.doc.create(null, nodes);
}

export function nodeToElement(node: PMNode): ScriptElement {
  const runs: TextRun[] = [];
  node.forEach((child) => {
    if (child.type === schema.nodes.hard_break) {
      runs.push({ text: '\n' });
      return;
    }
    const run: TextRun = { text: child.text ?? '' };
    for (const mark of child.marks) {
      if (mark.type === schema.marks.bold) run.bold = true;
      if (mark.type === schema.marks.italic) run.italic = true;
      if (mark.type === schema.marks.underline) run.underline = true;
    }
    runs.push(run);
  });
  return { kind: node.attrs.kind as ElementKind, runs: normalizeRuns(runs) };
}

/** ProseMirror document → script elements. */
export function docToElements(doc: PMNode): ScriptElement[] {
  const out: ScriptElement[] = [];
  doc.forEach((node) => out.push(nodeToElement(node)));
  return out;
}

/** Document position of the start of the element at `index` (before its opening token). */
export function elementPos(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
  return pos;
}
