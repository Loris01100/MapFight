# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build to `dist/`
- `npm test` — Vitest, single run
- Single test: `npx vitest run -t "boussole"` (matches the test name)
- Type check: `npx tsc` (`noEmit` is set; there is no lint script)

## What it is

A browser-only "world conquest" simulator. Every country starts as its own empire. Each click on "Tour suivant" plays one random battle, and the game ends when one empire owns the whole map. UI text, comments and test names are in French; keep it that way.

## Architecture

Two source files with a strict split:

- [src/game.ts](src/game.ts) — pure game logic, no DOM. All randomness goes through an injected `Rng`, so tests can feed exact dice (`dice(...)` helper in [src/game.test.ts](src/game.test.ts)).
  - `fight`: each side rolls 2d6. The attacker also rolls a bonus die that replaces their lowest die if it is higher. Sorted dice are compared pairwise, and a tied score rerolls everything.
  - `findDefender`: casts a ray from the territory centroid in one of 8 compass directions (`DIRS`, French labels: O = west), in 0.1° steps that wrap at the antimeridian. It returns the first territory owned by another empire (bbox prefilter, then `geoContains`).
  - `playTurn` **mutates `owner`**. If the attacker wins, the defender loses *all* its territories. If the attacker loses, it gives up only the territory it attacked from.
- [src/main.ts](src/main.ts) — data loading plus D3 rendering. It builds `territories` from `world-atlas/countries-50m.json`:
  - Geometries are mapped from ISO numeric to alpha-2 codes through `i18n-iso-countries`, with French names.
  - Only the `PLAYABLE` set is kept: UN members plus va/ps/tw/xk.
  - `MERGE` folds some geometries into another country (Greenland → DK, Somaliland → SO, …). Entities without an ISO id are matched by name.
  - `SKIP` drops a geometry entirely.

  The core state is a parallel array: `owner[i]` is the current empire code of `territories[i]`.

## Rendering details

- Each empire is filled with **one** flag SVG pattern stretched over the bounding box of all its territories. For each territory, only its largest polygon counts toward that box (`mainBounds`), so overseas islands don't distort the flag.
- Flags are loaded with `import.meta.glob` over `/node_modules/flag-icons/flags/4x3/*.svg`. A code with no flag gets a grey fill.
- Borders come from a single `topojson` `mesh` that only keeps arcs between different owners. It is redrawn on every `paint()`.
