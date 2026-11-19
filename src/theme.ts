// Fixed visual system (CLAUDE.md § Visual system). Change colours here only.
export const FAMILY = {
  algonquian: '#1D9E75',
  siouan: '#D85A30',
  iroquoian: '#5B4E6B', // context only
} as const;

export const DRIVER = {
  cahokia: '#BA7517',
  climate: '#378ADD',
  iroquoian: '#5B4E6B',
  french: '#2F4C7A',
  british: '#7A2633',
  american: '#2C3E50',
  americanBuff: '#D9C7A3',
  disease: '#8A8A8A',
  war: '#E34234',
} as const;

export const BASEMAP = {
  paper: '#F2EBDD',
  margin: '#E6DCC6',      // area outside the map plate
  lake: '#6E8A99',
  lakeFillAlpha: 0.42,    // water is a wash of the lake colour over paper
  sepia: '#5C4631',
  sepiaLight: '#8C7358',
} as const;

export const FONT = {
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
} as const;
