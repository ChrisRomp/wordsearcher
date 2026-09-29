# Agent instructions for Word Searcher

Browser-only, kid-safe word search maker (Vite + React 19 + TypeScript + Tailwind v4 + zustand). No backend: all state is in `localStorage`, share links, or `.wordsearch.json` files. The audience is K–8 teachers and kids, so content safety is a hard requirement.

## Commands

Node 23.6+ (build scripts run as TypeScript via native type stripping) and pnpm.

```sh
pnpm install
pnpm dev                 # http://localhost:5173
pnpm check               # everything CI runs: lint, typecheck, tests, build
pnpm lint                # oxlint (.oxlintrc.json)
pnpm typecheck           # tsc -b (app, node/scripts, and test projects)
pnpm test                # vitest run (all tests)

# Single file / single test
pnpm exec vitest run src/core/generator.test.ts
pnpm exec vitest run src/core/generator.test.ts -t "deterministic"

pnpm build:blocklist     # regenerates src/core/data/blocklist.json
pnpm build:dict          # regenerates public/dict/** (downloads cached in .cache/)
```

Tests live next to source as `*.test.ts(x)` under `src/` and `scripts/`. The default vitest environment is `node`. UI/store tests opt into jsdom with a `// @vitest-environment jsdom` pragma. UI tests also import `src/test/dom.ts` (stubs FontFace, `document.fonts`, canvas `measureText`, `<dialog>`) and `vi.mock('../state/generatorClient', …)` to run the generator in-process because jsdom has no Web Workers. See `src/ui/App.test.tsx`.

## Architecture

Data flows one way: **settings → generator (worker) → PuzzleDoc → layout display list → renderers**.

- **`src/core`**: pure, deterministic generator with no DOM or React. `generate()` validates with `analyzeWords()` (validate.ts), then places words, fills, and runs `repair()`, which scans all 8 directions with a trie (`scan.ts`) until every answer appears exactly once and filler hasn't created any blocklisted word. A blocked string lying entirely inside one answer is allowed. It either returns a complete grid or `{ ok: false, reason: 'invalid-input' | 'budget-exhausted' }`, never a partial puzzle. `worker.ts` calls `generateWithFit()` (`fit.ts`), which also handles auto-size. On a capacity failure it runs reduced-budget trials with the same seed to attach a `fit` suggestion: the smallest bigger grid (`grow`), or which words to drop at `GRID_MAX` (`trim`). A trial that succeeds is replayed exactly by the full run, so applying a suggestion always regenerates successfully. `src/state/generatorClient.ts` runs it off-thread, and a new run terminates the previous worker (`CancelledError`).
- **`src/state/store.ts`** (zustand + persist): holds `gen: GenSettings` (inputs that change the grid) separately from `style: StyleSettings` (presentation). The exception is `clueMode`: when auto-fill with themes is on, it filters the pool to words that have clues, so it is part of `settingsKey()` and triggers regeneration. `App.tsx`'s `useAutoGenerate` debounces `generateNow()` whenever `gen` or `style.clueMode` changes. `settingsKey()` (stable stringify) is compared with `docKey` to decide whether `doc` is current and to discard stale async results.
- **`doc`, `gen`, and `style` are deliberately decoupled.** `doc` is the last *successful* generation and stays visible while edited settings are invalid or a run fails, so don't assume `doc.settings` equals `gen` or `doc.style` equals `style`. The preview lays out `doc` with the *current* `style` (`useSheets`), and save/share must go through `exportDoc()`, which overlays the current style onto the snapshot.
- **`src/doc`**: `PuzzleDoc` is a self-contained snapshot (grid string, placements, style, settings, `gen` version). Opening a doc renders it exactly as saved and never regenerates it. `compact.ts` is the smaller share-link format and `share.ts` lz-compresses it into `#p=…`. **Every untrusted puzzle document goes through `parseDoc()`**: share links (`decodeDoc`), imported files (`docFromFile`), and the persisted `doc` in `localStorage`. Structural problems throw `DocError`: a wrong version, a bad grid size or shape, or a placement that is off-grid or doesn't spell its token. A doc's `style`/`settings` are sanitized field by field instead (`sanitizeStyle`/`sanitizeSettings`): invalid values fall back to defaults and strings are truncated. The other persisted state skips `parseDoc()`. The store's persist `merge` passes top-level `gen`/`style` directly to `sanitizeSettings()`/`sanitizeStyle()` and keeps the persisted `docKey` only if it matches the sanitized settings. `playStore` has its own `merge` sanitizer for progress.
- **`src/layout`**: `layoutSheet(sheetDoc, style, measure, { answerKey })` returns a `SheetLayout` (`pages`, first-page `grid` geometry for overlays, `overflowed`); text is sized with the injected `Measure`. Each `Page` is a list of primitive draw ops (`text`/`line`/`rect`/`path`, in PDF points). One display list drives three renderers: `PageSvg.tsx` (preview and print), `renderCanvas.ts` (PNG), and `renderPdf.ts` (jsPDF with embedded TTFs). Tests use `approxMeasure`, and the app uses `canvasMeasure` after fonts load.
- **`src/words`**: curated packs are JSON in `src/words/curated/packs/*.json`, loaded via `import.meta.glob` (just add a file). Dictionary categories are fetched lazily at runtime from `public/dict/` (`index.json` + `cat/<id>.json`) and generated by `scripts/build-dictionaries.ts` from config in `scripts/dict-categories.ts`.
- **Play mode** (`src/ui/play`) keys saved progress in `playStore` by `docHash(doc)` (grid + placements), not by seed. `found` stores indices into `doc.placements`, so reordering placements breaks saved progress. `selection.ts` snaps drags to one of the 8 directions and matches the selected cell path against placement paths in either direction, not the letters.
- **Dictionary pipeline** (`pnpm build:dict`): downloads Open English WordNet + SCOWL into `.cache/`, walks each category's WordNet `roots` (minus global and per-category excludes and deny lists), and assigns levels from SCOWL commonness. Clues are filtered through `makeClue()` in `scripts/dict-lib.ts`. It wipes and rewrites `public/dict/cat/`, `index.json`, and `ATTRIBUTION.md`, and drops categories below their minimum word count. Bump `DICT_VERSION` in `dict-categories.ts` when output changes. It is recorded as `doc.data` only when a dictionary theme feeds auto-fill; dictionary words added straight to the list don't set it. Known defect: the `dict-review.md` report path (`reviewPath`) is hardcoded to a specific Copilot session folder outside the repo.

## Conventions

- **Determinism is a contract.** The generator must only use the seeded `Rng` from `core/rng.ts`, never `Math.random`. If placement or fill behavior changes, bump `GENERATOR_VERSION` in `generator.ts`. If the doc shape changes, bump `DOC_VERSION` / `COMPACT_FORMAT` and keep `parseDoc`/`fromCompact` accepting old links.
- **Adding a setting** touches several places. Add it to `GenSettings` or `StyleSettings` plus the defaults in `state/settings.ts`, and add a clamp/allow-list branch in `sanitizeSettings`/`sanitizeStyle` (`doc/puzzleDoc.ts`). Otherwise it is silently dropped from share links and `localStorage`. `compact.ts` diffs against the defaults automatically. Put it in `gen` only if it should trigger regeneration.
- **Words have two forms**: `display` (what the teacher typed, e.g. "Black Hole") and `token` (A–Z grid form, e.g. `BLACKHOLE`) from `normalizeWord()`. Characters that can't fold to A–Z are errors, never silently dropped.
- **Content safety**: the blocklist is stored ROT13-encoded (`src/core/data/blocklist.json`, `scripts/build-blocklist.ts`). Keep plaintext offensive words out of the source tree. Filler must never spell a blocked word, but teacher-typed words are never blocked or altered. Curated packs must pass `packs.test.ts`: 45–60 words, tokens 3–15 letters, no word contained (forwards or reversed) in another, and clues that are at most 100 characters, don't end with a period, and don't contain the answer or any 3+ letter word from it. For new review-driven dictionary exclusions, use `manualDeny` (token + reason) in `dict-categories.ts` rather than bare `denyTokens`. Regenerated dictionary output should be reviewed by a human.
- **TypeScript settings** enforce `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type` for types, and don't use enums, namespaces, or constructor parameter properties. `scripts/` runs directly under Node, so imports there need explicit `.ts` extensions.
- **Styling** uses Tailwind v4 with theme tokens declared in `src/index.css` `@theme` (`ink`, `paper`, `tomato`, `teal`, `sun`, …) and shared component classes (`.btn`, `.btn-teal`, `.card`, `.seg`, `.field`). Reuse `src/ui/primitives.tsx` (`Section`, `Segmented`, `Toggle`, `Dialog`, `Stepper`) for editor controls.
- **Fonts**: every renderer uses the same `ws-<face>` families from `layout/fonts.ts`. Each face ships as both `.woff2` (screen) and `.ttf` (PDF embedding) in `public/fonts/`. Asset URLs must use `import.meta.env.BASE_URL` because the site is built with `base: './'` and served from a GitHub Pages subpath.
- **UI tests query by accessible role/label**, so keep `aria-*` labels and button names stable when editing components.
- **CI/deploy**: `.github/workflows/ci.yml` runs lint → typecheck → test → `vite build` on PRs and `main`, and deploys `dist/` to GitHub Pages from `main`. The license is AGPL-3.0-or-later.
