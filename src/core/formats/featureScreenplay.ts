import { textElement } from '../types';
import { ELEMENTS_WITHOUT_ACTS, SCREENPLAY_ELEMENTS, SCREENPLAY_PAGE, SCREENPLAY_VOCABULARY, screenplayFlow } from './screenplay';
import type { ScriptFormat } from './types';

/**
 * Feature film screenplay. The same page as single-camera TV, but no act
 * headings: the script opens with FADE IN: at the left margin and ends with
 * FADE OUT. flush right. Usually 90–120 pages.
 */
export const featureScreenplay: ScriptFormat = {
  id: 'feature-screenplay',
  name: 'Feature Screenplay',
  description: 'Feature film: continuous pages from FADE IN: to FADE OUT., no act headings.',
  episodic: false,
  templateSummary: 'FADE IN: to FADE OUT., no acts.',
  page: SCREENPLAY_PAGE,
  elementOrder: ELEMENTS_WITHOUT_ACTS,
  elements: SCREENPLAY_ELEMENTS,
  flow: screenplayFlow(ELEMENTS_WITHOUT_ACTS),
  vocabulary: SCREENPLAY_VOCABULARY,
  more: '(MORE)',
  contd: "(CONT'D)",
  template() {
    return [
      textElement('action', 'FADE IN:'),
      textElement('scene_heading', ''),
      textElement('action', ''),
      textElement('transition', 'FADE OUT.'),
    ];
  },
};
