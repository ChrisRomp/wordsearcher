# Word Searcher

[![CI](https://github.com/ChrisRomp/wordsearcher/actions/workflows/ci.yml/badge.svg)](https://github.com/ChrisRomp/wordsearcher/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

A free, kid-safe word search puzzle maker for teachers and families. It runs entirely in the browser: no accounts, no server, and nothing is uploaded.

**Try it: <https://chrisromp.github.io/wordsearcher/>**

## Features

- **Words:** type or paste your own (phrases like “Black Hole” stay together), pick from 30 hand-written classroom theme packs, or browse 42 “Kinds of…” dictionary lists (dog breeds, trees, tools…). Picking a theme replaces your list by default and titles the puzzle after it.
- **Difficulty:** Easy / Medium / Hard presets that set directions (any of 8), overlap (none / some / lots), and filler letters (random / natural / tricky decoys). Every setting can be overridden.
- **Grid:** 5–30 rows × columns, or let it pick the smallest square that fits a target fill level.
- **Worksheet:** title font/color/size, grid letter font, upper/lowercase, word list order (A–Z, as entered, by length, or hidden), optional name/date lines and instructions (turning them off gives the space to the puzzle), Letter/A4, portrait/landscape.
- **Output:** print, vector PDF (embedded fonts), PNG, and an optional answer-key page. Each sheet shows a short puzzle ID, a fingerprint of the grid, so worksheets and answer keys can be matched.
- **Share:** the whole puzzle is encoded in the link (or saved as a `.wordsearch.json` file), so recipients always get exactly the same grid.
- **Play:** solve in the browser with mouse, touch (drag or tap-tap), or keyboard (arrows + Enter). Includes a timer and saved progress.

## Puzzle guarantees

The generator (`src/core`) is deterministic for a given seed and checks every finished grid in all 8 directions:

- Every word appears **exactly once** in the enabled directions.
- Filler letters never spell a blocklisted word in any direction. Words you type yourself are never blocked or changed.
- Lists that can't work are caught before generation with one-click fixes. Examples: `CAT` inside `CATALOG` (you can allow nesting), `LIVE`/`EVIL` when backwards words are on, and words too long for the enabled directions.
- If it can't build a clean puzzle within its time budget, you get an explicit error. It never produces a partial puzzle.

## Development

Requires Node 23.6+ (build scripts are run as TypeScript) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # vitest: generator, layout, docs, packs, store, UI, dictionary helpers
pnpm lint         # oxlint
pnpm typecheck    # tsc -b
pnpm build        # typecheck + production build to dist/
pnpm check        # everything CI runs: lint, typecheck, tests, build
```

### Layout

```
src/core/      generator, validation, filler, scanning, presets, web worker
src/layout/    sheet layout → display list → SVG / Canvas (PNG) / jsPDF renderers
src/doc/       versioned PuzzleDoc, strict parsing of untrusted input, share links
src/words/     curated packs (JSON) and dictionary loaders
src/state/     zustand stores (settings, play progress), generator client
src/ui/        React UI (editor, preview, play)
scripts/       blocklist and dictionary build scripts
public/dict/   generated dictionary data (+ ATTRIBUTION.md)
public/fonts/  OFL fonts (woff2 for screen, ttf for PDF embedding)
```

### Rebuilding data

```sh
pnpm build:blocklist   # src/core/data/blocklist.json (ROT13-encoded)
pnpm build:dict        # public/dict/** from Open English WordNet 2025 + SCOWL
```

Downloads are cached in `.cache/` (gitignored). Dictionary categories, deny lists (each with a reason), and filters live in `scripts/dict-categories.ts`. Review changes before shipping: automated filters alone are not enough for a K–8 audience.

## CI and deployment

`.github/workflows/ci.yml` runs lint, typecheck, tests, and a production build on every pull request and every push to `main`. When a push to `main` passes, it also deploys `dist/` to GitHub Pages. The site is built with a relative base path, so `dist/` can be served from any subpath.

Dependabot (`.github/dependabot.yml`) checks npm packages and GitHub Actions monthly and opens grouped pull requests: npm minor/patch updates together, npm major updates together, and all Actions updates together. Security updates for npm are grouped too.

## License

The app code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). If you run a modified version for others over a network, you must offer them its source code. The word data and fonts below keep their own licenses.

## Data & font credits

- [Open English WordNet](https://en-word.net/) 2025 (CC BY 4.0). Filtered and modified.
- [SCOWL](http://wordlist.aspell.net/) word lists by Kevin Atkinson (permissive license), used for word commonness.
- [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) (CC BY 4.0), used only to keep filler letters clean.
- Fonts: Fredoka, Nunito, Patrick Hand, Atkinson Hyperlegible, Bree Serif (SIL Open Font License).

Full notices: `public/dict/ATTRIBUTION.md`.
