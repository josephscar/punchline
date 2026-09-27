import type { ElementKind, ScriptElement } from '../types';

/**
 * How one element type is laid out on the page.
 *
 * Positions are measured in characters of 12pt Courier, i.e. tenths of an
 * inch, from the left text margin. Using character units keeps the editor
 * (CSS `ch`), the paginator and the PDF writer in lock-step.
 */
export interface ElementStyle {
  label: string;
  /** One-line explanation shown in the element menu and help. */
  hint: string;
  /** Placeholder text shown in an empty paragraph of this type. */
  placeholder: string;
  /** Digit used with Ctrl/⌘ to switch to this element. */
  shortcut: string;
  indent: number;
  width: number;
  align: 'left' | 'center' | 'right';
  caps: boolean;
  bold: boolean;
  underline: boolean;
  /** Blank lines printed above the element (dropped at the top of a page). */
  spaceBefore: number;
  /** Notes are shown in the editor but never printed. */
  printable: boolean;
  /** Always begin on a fresh page (e.g. each act of a single-cam script). */
  startsPage?: boolean;
  /** Never leave this element alone at the bottom of a page. */
  keepWithNext?: boolean;
  /** Extra indent for wrapped lines (parentheticals hang inside the bracket). */
  hangingIndent?: number;
  /** Text drawn around the element's content, e.g. parentheses. */
  wrapWith?: [string, string];
}

export interface ElementFlow {
  /** Enter at the end of a non-empty element starts this element next. */
  enter: Record<ElementKind, ElementKind>;
  /** Enter in an empty element turns it into this element instead. */
  emptyEnter: Partial<Record<ElementKind, ElementKind>>;
  /** Tab in an empty element turns it into this element. */
  tab: Partial<Record<ElementKind, ElementKind>>;
  /** Shift+Tab in an empty element turns it into this element. */
  shiftTab: Partial<Record<ElementKind, ElementKind>>;
  /** Tab at the end of a non-empty element starts this element next. */
  tabAtEnd: Partial<Record<ElementKind, ElementKind>>;
}

export interface PageSetup {
  widthIn: number;
  heightIn: number;
  marginLeftIn: number;
  marginRightIn: number;
  marginTopIn: number;
  /** Lines of 12pt Courier (6 per inch) that fit between top and bottom margins. */
  linesPerPage: number;
  /** Distance from the top edge to the page number. */
  pageNumberTopIn: number;
}

/** Words the autocomplete offers for this format. */
export interface Vocabulary {
  sceneIntros: string[];
  times: string[];
  transitions: string[];
  actNames: string[];
  endOfShow: string;
  shots: string[];
  parentheticals: string[];
  extensions: string[];
}

export interface ScriptFormat {
  id: string;
  name: string;
  description: string;
  page: PageSetup;
  elements: Record<ElementKind, ElementStyle>;
  /** Order elements appear in menus and help. */
  elementOrder: ElementKind[];
  flow: ElementFlow;
  vocabulary: Vocabulary;
  /** Printed at the bottom of a page when a speech continues overleaf. */
  more: string;
  /** Character extension for continued speech. */
  contd: string;
  /** Starting content for a brand-new script in this format. */
  template(): ScriptElement[];
}
