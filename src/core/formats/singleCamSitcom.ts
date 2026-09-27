import { textElement } from '../types';
import { ALL_ELEMENTS, SCREENPLAY_ELEMENTS, SCREENPLAY_PAGE, SCREENPLAY_VOCABULARY, screenplayFlow } from './screenplay';
import type { ScriptFormat } from './types';

/**
 * Single-camera half-hour comedy (The Office, Parks and Recreation,
 * Abbott Elementary, 30 Rock…).
 *
 * Laid out like a feature screenplay — mixed-case action, single-spaced
 * dialogue, no scene letters — with a TV act structure on top: a cold open,
 * two to four acts and usually a tag. Each act starts on a new page with its
 * name centered, bold and underlined, and ends with a matching "END OF …"
 * line. A finished draft usually runs 25–35 pages.
 */
export const singleCamSitcom: ScriptFormat = {
  id: 'single-cam-sitcom',
  name: 'Single-Cam Sitcom',
  description: 'Half-hour single-camera comedy: screenplay-style pages with a cold open, acts and a tag.',
  episodic: true,
  templateSummary: 'Cold open, two acts and a tag.',
  page: SCREENPLAY_PAGE,
  elementOrder: ALL_ELEMENTS,
  elements: SCREENPLAY_ELEMENTS,
  flow: screenplayFlow(),
  vocabulary: {
    ...SCREENPLAY_VOCABULARY,
    times: [...SCREENPLAY_VOCABULARY.times, 'TALKING HEAD'],
    actSequence: ['COLD OPEN', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'TAG'],
    actNames: ['COLD OPEN', 'TEASER', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'TAG'],
    endOfShow: 'END OF SHOW',
    shots: [...SCREENPLAY_VOCABULARY.shots, 'TALKING HEAD'],
    parentheticals: [...SCREENPLAY_VOCABULARY.parentheticals.slice(0, -2), 'to camera', 'deadpan', 'singing', 're: ', 'to '],
  },
  more: '(MORE)',
  contd: "(CONT'D)",
  template() {
    return [
      textElement('act_start', 'COLD OPEN'),
      textElement('scene_heading', ''),
      textElement('action', ''),
      textElement('act_end', 'END OF COLD OPEN'),
      textElement('act_start', 'ACT ONE'),
      textElement('scene_heading', ''),
      textElement('action', ''),
      textElement('act_end', 'END OF ACT ONE'),
      textElement('act_start', 'ACT TWO'),
      textElement('scene_heading', ''),
      textElement('action', ''),
      textElement('act_end', 'END OF ACT TWO'),
      textElement('act_start', 'TAG'),
      textElement('scene_heading', ''),
      textElement('action', ''),
      textElement('act_end', 'END OF SHOW'),
    ];
  },
};
