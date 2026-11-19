// Shared data model (SPEC.md § Data model). Used by the app and by scripts/validate.ts.

export const CONFIDENCE = ['high', 'med', 'low', 'contested'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const LANGUAGE_LEVELS = ['family', 'branch', 'language', 'dialect'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const LANGUAGE_STATUS = ['living', 'revitalizing', 'unrecorded', 'extinct'] as const;
export type LanguageStatus = (typeof LANGUAGE_STATUS)[number];

export const DRIVERS = [
  'cahokia', 'climate', 'migration', 'european', 'iroquoian',
  'french', 'british', 'american', 'disease', 'war',
] as const;
export type Driver = (typeof DRIVERS)[number];

/** Map extent from CLAUDE.md: lon −98…−72, lat 33…50. */
export const BOUNDS = { lonMin: -98, lonMax: -72, latMin: 33, latMax: 50 } as const;
/** Time range from SPEC.md (900 → 1900, plus a separate Today state). */
export const YEARS = { min: 900, max: 1900, today: new Date().getFullYear() } as const;

/** Source key reserved for "standard fact, source still to attach". */
export const NEEDS_SOURCE = 'needs_source';

export interface Source { cite: string; url: string; tier: string }
export interface SourcesFile { sources: Record<string, Source> }

export interface Language {
  id: string;
  name: string;
  parent: string | null;
  level: LanguageLevel;
  status: LanguageStatus;
  note?: string;
}
export interface LanguagesFile { languages: Language[] }

export interface Position {
  year: number;
  lat: number;
  lon: number;
  confidence: Confidence;
  source: string;
  note?: string;
}

export interface SplitOrMerge { year: number; into: string; source: string; note?: string }

export interface Nation {
  id: string;
  name: string;
  language: string;
  positions: Position[];
  alt_positions?: Position[];
  splits?: SplitOrMerge[];
  merges?: SplitOrMerge[];
}
export interface NationsFile { nations: Nation[] }

export interface HistEvent {
  id: string;
  year_start: number;
  year_end: number;
  title: string;
  driver: Driver;
  lat: number;
  lon: number;
  confidence: Confidence;
  source: string;
  actors: string[];
  note?: string;
}
export interface EventsFile { events: HistEvent[] }

export interface PlaceName {
  name: string;
  lat: number;
  lon: number;
  language: string;
  meaning: string;
  confidence: Confidence;
  source: string;
  note?: string;
}
export interface PlaceNamesFile { placenames: PlaceName[] }

/** A named stop on the timeline (SPEC § Time › Chapters). */
export interface Chapter {
  id: string;
  plate: number;
  /** null while the chapter is a placeholder awaiting data. */
  title: string | null;
  year_start: number | null;
  year_end: number | null;
  status: 'defined' | 'placeholder';
  note?: string;
}
export interface ChaptersFile { chapters: Chapter[] }

/** Driver layers (SPEC § Layer toggles). Wiring only; history stays in events. */
export interface DriverPhase {
  kind: 'pull' | 'release';
  from_event: string;
  to_event: string;
  note?: string;
}
export interface DriverRegion { event: string; label: string; note?: string }
export interface MaizeKeyframe { year: number; lat: number; confidence: Confidence; source: string }
export interface DriversFile {
  cahokia: {
    site: { name: string; lat: number; lon: number; confidence: Confidence; source: string };
    phases: DriverPhase[];
    abandoned_event: string;
    regions: DriverRegion[];
  };
  climate: {
    drought_events: string[];
    maize_line: { status: 'schematic' | 'sourced'; label: string; note?: string; keyframes: MaizeKeyframe[] };
  };
  disease: { status: 'no_data' | 'available'; note?: string };
}

/**
 * A present-day nation for the Today view. `historic` links to nation ids in
 * nations.json where the lineage is sourced; `kind` says what the point marks.
 */
export interface TodayNation {
  id: string;
  name: string;
  language: string;
  historic?: string[];
  kind: 'headquarters' | 'reservation' | 'community' | 'statistical_area' | 'trust_land';
  lat: number;
  lon: number;
  confidence: Confidence;
  /** Source of the location. */
  source: string;
  /** Source of the official name, when different. */
  name_source?: string;
  note?: string;
}
export interface TodayFile { note?: string; nations: TodayNation[] }

export interface Dataset {
  sources: Record<string, Source>;
  languages: Language[];
  nations: Nation[];
  events: HistEvent[];
  placenames: PlaceName[];
  chapters: Chapter[];
  drivers: DriversFile;
  today: TodayNation[];
}
