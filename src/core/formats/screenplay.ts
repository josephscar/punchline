import type { ElementKind } from '../types';
import type { ElementFlow, ElementStyle, PageSetup, Vocabulary } from './types';

/**
 * The screenplay page shared by single-camera TV and features.
 *
 * US Letter, 12pt Courier, 10 characters per inch:
 *   left margin 1.5"  · right margin 1"  · 54 lines per page
 *   Scene heading / action / shot   1.5"–7.5"
 *   Character                       3.7"
 *   Parenthetical                   3.1"–5.5"
 *   Dialogue                        2.5"–6.0"
 *   Transition                      flush right at 7.5"
 *
 * Formats differ in structure (acts or none), vocabulary and templates;
 * they spread these shared definitions and override what they need.
 */

export const SCREENPLAY_PAGE: PageSetup = {
  widthIn: 8.5,
  heightIn: 11,
  marginLeftIn: 1.5,
  marginRightIn: 1,
  marginTopIn: 1,
  linesPerPage: 54,
  pageNumberTopIn: 0.5,
};

export const SCREENPLAY_ELEMENTS: Record<ElementKind, ElementStyle> = {
  scene_heading: {
    label: 'Scene Heading',
    hint: 'Slugline that starts a scene: INT. or EXT., location, time of day.',
    placeholder: 'INT. LOCATION - DAY',
    shortcut: '1',
    indent: 0,
    width: 60,
    align: 'left',
    caps: true,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: true,
    keepWithNext: true,
  },
  action: {
    label: 'Action',
    hint: 'What we see and hear, in present tense.',
    placeholder: 'Action — what we see.',
    shortcut: '2',
    indent: 0,
    width: 60,
    align: 'left',
    caps: false,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: true,
  },
  character: {
    label: 'Character',
    hint: "Who speaks next. Add (V.O.), (O.S.) or (CONT'D) after the name.",
    placeholder: 'CHARACTER',
    shortcut: '3',
    indent: 22,
    width: 38,
    align: 'left',
    caps: true,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: true,
    keepWithNext: true,
  },
  parenthetical: {
    label: 'Parenthetical',
    hint: 'A short direction for how a line is delivered.',
    placeholder: 'beat',
    shortcut: '4',
    indent: 16,
    width: 24,
    align: 'left',
    caps: false,
    bold: false,
    underline: false,
    spaceBefore: 0,
    printable: true,
    keepWithNext: true,
    hangingIndent: 1,
    wrapWith: ['(', ')'],
  },
  dialogue: {
    label: 'Dialogue',
    hint: 'What the character says.',
    placeholder: 'Dialogue',
    shortcut: '5',
    indent: 10,
    width: 35,
    align: 'left',
    caps: false,
    bold: false,
    underline: false,
    spaceBefore: 0,
    printable: true,
  },
  transition: {
    label: 'Transition',
    hint: 'How we move to the next scene — CUT TO:, SMASH CUT TO:.',
    placeholder: 'CUT TO:',
    shortcut: '6',
    indent: 40,
    width: 20,
    align: 'right',
    caps: true,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: true,
  },
  shot: {
    label: 'Shot',
    hint: 'A secondary slugline inside a scene — ANGLE ON, BACK TO SCENE.',
    placeholder: 'ANGLE ON',
    shortcut: '7',
    indent: 0,
    width: 60,
    align: 'left',
    caps: true,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: true,
    keepWithNext: true,
  },
  act_start: {
    label: 'New Act',
    hint: 'TEASER, COLD OPEN, ACT ONE, TAG… Each act starts on a new page.',
    placeholder: 'ACT ONE',
    shortcut: '8',
    indent: 0,
    width: 60,
    align: 'center',
    caps: true,
    bold: true,
    underline: true,
    spaceBefore: 0,
    printable: true,
    startsPage: true,
    keepWithNext: true,
  },
  act_end: {
    label: 'End of Act',
    hint: 'END OF ACT ONE, END OF SHOW.',
    placeholder: 'END OF ACT ONE',
    shortcut: '9',
    indent: 0,
    width: 60,
    align: 'center',
    caps: true,
    bold: true,
    underline: true,
    spaceBefore: 1,
    printable: true,
  },
  note: {
    label: 'Note',
    hint: 'A private note to yourself. Never printed or exported to PDF.',
    placeholder: 'Note to self…',
    shortcut: '0',
    indent: 0,
    width: 60,
    align: 'left',
    caps: false,
    bold: false,
    underline: false,
    spaceBefore: 1,
    printable: false,
  },
};

export const ALL_ELEMENTS: ElementKind[] = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'act_start',
  'act_end',
  'note',
];

/** Elements used by formats without acts (features). */
export const ELEMENTS_WITHOUT_ACTS: ElementKind[] = ALL_ELEMENTS.filter((k) => k !== 'act_start' && k !== 'act_end');

/**
 * Tab cycles through the four elements a writer switches between most.
 * Everything else (dialogue follows a character on Enter; parentheticals,
 * shots, act lines and notes are rarer) is in the element menu and on the
 * Alt+number keys.
 */
export const TAB_CYCLE: ElementKind[] = ['scene_heading', 'action', 'character', 'transition'];

export function screenplayFlow(): ElementFlow {
  return {
    enter: {
      scene_heading: 'action',
      action: 'action',
      character: 'dialogue',
      parenthetical: 'dialogue',
      dialogue: 'character',
      transition: 'scene_heading',
      shot: 'action',
      act_start: 'scene_heading',
      act_end: 'act_start',
      note: 'action',
    },
    emptyEnter: {
      action: 'scene_heading',
      character: 'action',
      dialogue: 'action',
      parenthetical: 'dialogue',
      transition: 'scene_heading',
      shot: 'action',
      note: 'action',
    },
    tabCycle: TAB_CYCLE,
  };
}

export const SCREENPLAY_VOCABULARY: Vocabulary = {
  sceneIntros: ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.'],
  times: ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'SAME TIME', 'DAWN', 'DUSK', 'FLASHBACK'],
  transitions: [
    'CUT TO:',
    'SMASH CUT TO:',
    'MATCH CUT TO:',
    'HARD CUT TO:',
    'JUMP CUT TO:',
    'DISSOLVE TO:',
    'CUT TO BLACK.',
    'FADE OUT.',
    'FADE TO BLACK.',
    'INTERCUT WITH:',
    'BACK TO:',
    'TIME CUT:',
  ],
  actSequence: [],
  actNames: [],
  endOfShow: 'THE END',
  shots: [
    'ANGLE ON',
    'CLOSE ON',
    'WIDE ON',
    'BACK TO SCENE',
    'INSERT',
    'POV',
    'RESUME',
    'MONTAGE',
    'END MONTAGE',
    'SERIES OF SHOTS',
    'FLASHBACK',
    'END FLASHBACK',
    'SPLIT SCREEN',
    'SUPER:',
  ],
  parentheticals: [
    'beat',
    'then',
    'sotto',
    'quietly',
    'continuing',
    'overlapping',
    'into phone',
    'on phone',
    'reading',
    'whispering',
    'laughing',
    'sarcastic',
    're: ',
    'to ',
  ],
  extensions: ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'ON PHONE', 'ON TV', 'FILTERED'],
};
