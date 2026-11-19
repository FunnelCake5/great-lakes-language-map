// Semantic zoom (SPEC § Language tree panel): recolour the map by family,
// branch or language. Each family keeps its hue (teal / coral / violet) and
// its groups fan out around it, so a branch still reads as Algonquian or
// Siouan at a glance.
import { FAMILY } from '../theme';
import type { Family, LanguageIndex } from './lang';
import type { Language } from './types';

export type ZoomLevel = 'family' | 'branch' | 'language';

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

export class Palette {
  level: ZoomLevel = 'family';
  private colours = new Map<string, string>();

  constructor(private lang: LanguageIndex, languages: readonly Language[], usedLanguageIds: readonly string[]) {
    // Assign shades only to groups that some nation actually falls into, so
    // neighbouring colours stay as distinct as possible.
    for (const level of ['branch', 'language'] as const) {
      const byFamily = new Map<Family, string[]>();
      for (const id of usedLanguageIds) {
        const fam = lang.family(id);
        const g = this.groupAt(level, id);
        if (!fam || !g) continue;
        const list = byFamily.get(fam) ?? [];
        if (!list.includes(g)) list.push(g);
        byFamily.set(fam, list);
      }
      for (const [fam, groups] of byFamily) {
        // Stable order: as the groups appear in languages.json.
        groups.sort((a, b) => languages.findIndex((l) => l.id === a) - languages.findIndex((l) => l.id === b));
        const [h, s, l] = hexToHsl(FAMILY[fam]);
        const n = groups.length;
        groups.forEach((g, i) => {
          const span = Math.min(56, 14 * n);
          // Siouan coral fans toward red/rose only, keeping clear of Cahokia amber.
          const offset = n === 1 ? 0 : fam === 'siouan' ? -(i / (n - 1)) * span : (i / (n - 1) - 0.5) * span;
          const light = n === 1 ? l : l + (i % 2 ? 0.1 : -0.06);
          this.colours.set(`${level}:${g}`, hslToHex((h + offset + 360) % 360, Math.min(1, s * 1.05), Math.max(0.25, Math.min(0.6, light))));
        });
      }
    }
  }

  /** The tree node a language falls under at a zoom level. */
  groupAt(level: ZoomLevel, languageId: string): string | undefined {
    const path = this.lang.path(languageId);
    if (!path.length) return undefined;
    if (level === 'family') return path[0].id;
    if (level === 'branch') return (path[1] ?? path[0]).id;
    return (path.find((l) => l.level === 'language') ?? path[path.length - 1]).id;
  }

  /** Colour for a nation's language at the current level. */
  colourOf(languageId: string): string {
    const fam = this.lang.family(languageId);
    if (this.level === 'family' || !fam) return fam ? FAMILY[fam] : '#8C7358';
    const g = this.groupAt(this.level, languageId);
    return (g && this.colours.get(`${this.level}:${g}`)) ?? FAMILY[fam];
  }

  /** Colour for a tree node at the current level, or null if the node is not a group at this level. */
  colourOfNode(node: Language): string | null {
    const fam = this.lang.family(node.id);
    if (!fam) return null;
    if (this.level === 'family') return node.level === 'family' ? FAMILY[fam] : null;
    return this.colours.get(`${this.level}:${node.id}`) ?? null;
  }

  /** Grouping key used by the density fields. */
  groupKey(languageId: string): string {
    return this.groupAt(this.level, languageId) ?? languageId;
  }
}

/** Darken a hex colour for text on paper. */
export function ink(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0.18, l - 0.16));
}
