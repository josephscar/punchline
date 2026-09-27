import { textElement, type ScriptElement } from '../types';
import { ALL_ELEMENTS, SCREENPLAY_ELEMENTS, SCREENPLAY_PAGE, SCREENPLAY_VOCABULARY, screenplayFlow } from './screenplay';
import type { ScriptFormat } from './types';

const ACTS = ['TEASER', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE'];

/**
 * One-hour drama (Grey's Anatomy, The Good Wife, Yellowstone…). The same
 * screenplay page as single-cam, with a teaser and
 * four to six acts for network shows; each act starts on a new page and the
 * last one ends with END OF EPISODE. Usually 50–65 pages.
 */
export const oneHourDrama: ScriptFormat = {
  id: 'one-hour-drama',
  name: 'One-Hour Drama',
  description: 'Hour-long single-camera drama: a teaser and five acts, each on a new page.',
  episodic: true,
  templateSummary: 'Teaser and five acts.',
  page: SCREENPLAY_PAGE,
  elementOrder: ALL_ELEMENTS,
  elements: SCREENPLAY_ELEMENTS,
  flow: screenplayFlow(),
  vocabulary: {
    ...SCREENPLAY_VOCABULARY,
    actSequence: ACTS,
    actNames: [...ACTS, 'ACT SIX', 'COLD OPEN', 'TAG'],
    endOfShow: 'END OF EPISODE',
  },
  more: '(MORE)',
  contd: "(CONT'D)",
  template() {
    const elements: ScriptElement[] = [];
    ACTS.forEach((act, i) => {
      const last = i === ACTS.length - 1;
      elements.push(
        textElement('act_start', act),
        textElement('scene_heading', ''),
        textElement('action', ''),
        textElement('act_end', last ? 'END OF EPISODE' : `END OF ${act}`),
      );
    });
    return elements;
  },
};
