# great-lakes-language-map

An animated atlas of the Algonquian and Siouan language families across the Great Lakes and Midwest, from about 900 CE to today, showing the movements of peoples and the forces that drove them.

- `SPEC.md`: what we're building and the roadmap
- `CLAUDE.md`: rules for Claude Code sessions
- `data/`: the history, with a source and confidence level on every record

**Start a phase from the Claude app's Code tab:**
> Read SPEC.md and CLAUDE.md. Build roadmap phase 1 on a new branch and open a PR with a screenshot.

## Develop

```sh
npm install
npm run dev        # local server at http://localhost:5173/great-lakes-language-map/
npm run validate   # schema, references, bounds and CLAUDE.md rules; CI fails if this fails
npm run gaps       # regenerate data/GAPS.md (keeps the hand-written "Other known gaps" section)
npm run build      # typecheck + production build to dist/
npm run basemap    # re-download and clip the Natural Earth layers into public/geo/
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`
(repo Settings → Pages → Source must be set to **GitHub Actions**).

## Data gaps

Everything that needs a source or is contested is listed in the app's **Gaps** tab and in `data/GAPS.md`. Both are generated from the same code (`src/data/gaps.ts`). After changing data, run `npm run gaps`; `npm run validate` fails if `GAPS.md` is out of date.

## Narration

Each chapter can have one optional audio track. Put the file in `public/audio/` and add to the chapter in `data/chapters.json`:

```json
"narration": { "file": "plate-0.mp3", "credit": "Read by …", "transcript": "…" }
```

A **Listen** button appears while the timeline is inside that chapter. Audio plays only after a tap, as iPad Safari requires. The validator checks that the file exists and that a credit is given. Placeholder chapters can't have narration.
