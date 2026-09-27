import { featureScreenplay } from './featureScreenplay';
import { oneHourDrama } from './oneHourDrama';
import { singleCamSitcom } from './singleCamSitcom';
import type { ScriptFormat } from './types';

export type { ScriptFormat, ElementStyle, ElementFlow, PageSetup, Vocabulary } from './types';

/**
 * Every script format the app knows about. Multi-camera sitcom is planned
 * next (see docs/ROADMAP.md); it needs double-spaced dialogue and scene letters.
 */
export const FORMATS: ScriptFormat[] = [singleCamSitcom, oneHourDrama, featureScreenplay];

export const DEFAULT_FORMAT_ID = singleCamSitcom.id;

export function getFormat(id: string | undefined): ScriptFormat {
  return FORMATS.find((f) => f.id === id) ?? singleCamSitcom;
}
