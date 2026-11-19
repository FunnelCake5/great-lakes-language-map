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
