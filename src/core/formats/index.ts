import { singleCamSitcom } from './singleCamSitcom';
import type { ScriptFormat } from './types';

export type { ScriptFormat, ElementStyle, ElementFlow, PageSetup, Vocabulary } from './types';

/**
 * Every script format the app knows about. Version 2 adds more formats
 * (multi-cam sitcom, one-hour drama, feature…) by registering them here.
 */
export const FORMATS: ScriptFormat[] = [singleCamSitcom];

export const DEFAULT_FORMAT_ID = singleCamSitcom.id;

export function getFormat(id: string | undefined): ScriptFormat {
  return FORMATS.find((f) => f.id === id) ?? singleCamSitcom;
}
