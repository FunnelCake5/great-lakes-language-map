// Layer toggles (SPEC § Layer toggles). Each toggle owns one or more event
// drivers. "Other events" covers drivers SPEC does not list as toggles
// (migration, early European contact, wars outside the Iroquoian conflict).
import { DRIVER } from '../theme';

export interface LayerDef {
  id: string;
  label: string;
  drivers: string[];
  colour: string;
  /** Visible placeholder: no data yet, or arrives in a later phase. */
  placeholder?: string;
}

export const LAYERS: LayerDef[] = [
  { id: 'cahokia', label: 'Cahokia', drivers: ['cahokia'], colour: DRIVER.cahokia },
  { id: 'climate', label: 'Climate', drivers: ['climate'], colour: DRIVER.climate },
  { id: 'iroquoian', label: 'Iroquoian wars', drivers: ['iroquoian'], colour: DRIVER.iroquoian },
  { id: 'french', label: 'French', drivers: ['french'], colour: DRIVER.french },
  { id: 'british', label: 'British', drivers: ['british'], colour: DRIVER.british },
  { id: 'american', label: 'American', drivers: ['american'], colour: DRIVER.american },
  { id: 'other', label: 'Other events', drivers: ['migration', 'european', 'war'], colour: DRIVER.migration },
  { id: 'disease', label: 'Disease', drivers: ['disease'], colour: DRIVER.disease, placeholder: 'No data yet' },
  { id: 'placenames', label: 'Place names', drivers: [], colour: '#5C4631' },
];

export const driverColour = (d: string): string => (DRIVER as Record<string, string>)[d] ?? DRIVER.migration;

export class LayerState {
  private on = new Set(LAYERS.filter((l) => !l.placeholder).map((l) => l.id));
  private listeners = new Set<() => void>();

  isOn(id: string) { return this.on.has(id); }
  set(id: string, value: boolean) {
    if (value) this.on.add(id); else this.on.delete(id);
    for (const fn of this.listeners) fn();
  }
  subscribe(fn: () => void) { this.listeners.add(fn); }

  /** Is an event with this driver currently shown? */
  showsDriver(driver: string) {
    return LAYERS.some((l) => l.drivers.includes(driver) && this.on.has(l.id));
  }
}
