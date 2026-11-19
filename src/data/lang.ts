// Language-tree helpers. Nations reference a language id; the family is found
// by walking up the tree (rule 6: nations ≠ languages).
import type { Language } from './types';

export type Family = 'algonquian' | 'siouan' | 'iroquoian';

export function languageIndex(languages: readonly Language[]) {
  const byId = new Map(languages.map((l) => [l.id, l]));

  /** Root-to-leaf chain, e.g. Algonquian › Sauk–Fox–Kickapoo › Kickapoo. */
  const path = (id: string): Language[] => {
    const out: Language[] = [];
    const seen = new Set<string>();
    for (let l = byId.get(id); l && !seen.has(l.id); l = l.parent ? byId.get(l.parent) : undefined) {
      seen.add(l.id);
      out.unshift(l);
    }
    return out;
  };

  const family = (id: string): Family | undefined => {
    const root = path(id)[0]?.id;
    return root === 'algonquian' || root === 'siouan' || root === 'iroquoian' ? root : undefined;
  };

  return { byId, path, family };
}
export type LanguageIndex = ReturnType<typeof languageIndex>;
