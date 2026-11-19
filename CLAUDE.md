# CLAUDE.md — Great Lakes Language Map

An animated, time-scrubbable map showing how the Algonquian and Siouan language families, and the nations within them, moved across the Great Lakes and Midwest from about 900 CE to the present. The forces that moved them are shown as layers: Cahokia, climate, Iroquois wars, French and British trade, and American expansion.

Read `SPEC.md` before any work. Data lives in `data/`. The history is in the data; the code only renders it.

## Non-negotiable rules

1. **Never invent history.** No new nation positions, dates, populations or events unless they come with a real source. If something needs data that doesn't exist yet, render a visible placeholder and add a `TODO(data)` note to `data/GAPS.md`.
2. **Every datum carries `confidence` and `source`.** Confidence is one of `high | med | low | contested`. The source is a key in `data/sources.json`.
3. **Show uncertainty; never hide it.** Low confidence renders fainter and blurrier. A `contested` item renders all of its alternatives as ghosted options (for example, the Mascouten homeland: SW Michigan or the Maumee Valley).
4. **`needs_source` items render with a dashed outline** and are listed in the in-app "data gaps" panel. Never present them as settled.
5. **Sultzman is a weak source** (`tier: secondary-weak`). It is acceptable for placeholder positions, but never upgrade its confidence above `low` without a corroborating source.
6. **Nations ≠ languages.** Keep the levels separate: family → branch → language → dialect is the language tree, and nations reference a language id. Several nations can share one language (Miami, Wea, Piankashaw, Peoria and Kaskaskia all speak Miami–Illinois).
7. **Respectful framing.** These are living nations. Never use "vanished" or "extinct" for peoples; "extinct" is reserved for languages with no speakers. The "today" layer shows present-day nations.

## Visual system (fixed)

- **Algonquian:** teal `#1D9E75`. **Siouan:** coral `#D85A30`. **Iroquoian (context only):** slate violet `#5B4E6B`.
- **Drivers:** Cahokia amber `#BA7517` · climate blue `#378ADD` · Iroquoian pressure violet `#5B4E6B` · French `#2F4C7A` · British `#7A2633` · American buff/navy `#2C3E50` · disease grey stipple · war vermilion hatch.
- **Basemap:** cream paper `#F2EBDD`, lakes blue-grey `#6E8A99`, sepia linework. Atlas look, not a slippy-map UI.
- **Fonts:** serif small caps for labels; sans for UI.
- **Must work on an iPad Pro**, in Safari, touch-first: tap targets of at least 44px, and no hover-only interactions.

## Engineering

- **Stack:** Vite + TypeScript + D3 (geo + scales) rendering on Canvas, with an SVG overlay for labels. No paid tile services and no API keys.
- **Basemap:** Natural Earth GeoJSON (coastline, lakes, rivers), committed to `public/geo/`, clipped to lon −98…−72 and lat 33…50.
- **Deploy:** GitHub Pages via an Actions workflow on every push to `main`.
- **Data validation:** `npm run validate` checks schema, referential integrity (sources, language ids, actor ids) and coordinate bounds. CI fails if it fails.
- **Branches:** small PRs, one roadmap phase per PR, each with a screenshot in the PR description.
