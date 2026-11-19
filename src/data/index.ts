// The history lives in data/; the app only renders it.
import sourcesFile from '../../data/sources.json';
import languagesFile from '../../data/languages.json';
import nationsFile from '../../data/nations.json';
import eventsFile from '../../data/events.json';
import placenamesFile from '../../data/placenames.json';
import type {
  Dataset, EventsFile, LanguagesFile, NationsFile, PlaceNamesFile, SourcesFile,
} from './types';

export const dataset: Dataset = {
  sources: (sourcesFile as SourcesFile).sources,
  languages: (languagesFile as LanguagesFile).languages,
  nations: (nationsFile as NationsFile).nations,
  events: (eventsFile as unknown as EventsFile).events,
  placenames: (placenamesFile as PlaceNamesFile).placenames,
};
