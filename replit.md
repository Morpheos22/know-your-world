# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The workspace contains a single
deployable application — the `know-your-world` geography quiz game — plus a
small `scripts` package for utility scripts.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19, Vite 7

## Structure

```text
know-your-world/
├── artifacts/
│   └── know-your-world/   # Geography quiz game (React + Vite, frontend-only)
├── scripts/               # Utility scripts (single workspace package)
│   └── src/               # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml    # pnpm workspace config + catalog
├── tsconfig.base.json     # Shared TS options
├── tsconfig.json          # Root TS config (no project references — packages typecheck independently)
└── package.json           # Root package with shared devDeps
```

## Root Scripts

- `pnpm run build` — runs typecheck, then builds `@workspace/know-your-world`
- `pnpm run typecheck` — runs `tsc --noEmit` in the quiz app
- `pnpm run format` — runs `prettier --write .`
- `pnpm run format:check` / `pnpm run lint` — runs `prettier --check .`

## Packages

### `artifacts/know-your-world` (`@workspace/know-your-world`)

Geography quiz game built with React + Vite. Purely frontend — no backend API
or database.

- **Stack**: React 19, Vite 7, TypeScript
- **Theme**: Terracotta (#E07A5F) + papyrus (#FDF6E3) palette, Fredoka + Poppins fonts
- **Features**: 4 continents (Africa, Asia, Europe, Americas) x 4 categories (Countries & Capitals, Presidents, Flags, Currencies) x 3 difficulty levels
- **Game flow**: Home -> Select Continent -> Select Category -> Quiz (10 items: 8 questions + 2 facts per level) -> Result
- **Scoring**: 10-item queue per level (8 questions + 2 fact cards). All items count toward score. Pass threshold: 5/10 to advance
- **Flags category**: Shows flag emojis with "Which country does this flag belong to?" questions
- **Data**: All question data in `src/data/` (africa.ts, asia.ts, europe.ts, americas.ts, facts.ts)
- **Branding**: "Developed by Faiza Fadipe, 2025" in footer
- **Port**: reads from `PORT` env var
- **No user accounts or score history** — fully stateless

- `pnpm --filter @workspace/know-your-world run dev` — run the dev server
- `pnpm --filter @workspace/know-your-world run build` — production Vite build (`dist/public`)
- `pnpm --filter @workspace/know-your-world run typecheck` — `tsc --noEmit`

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a
corresponding npm script in `package.json`. Run scripts via
`pnpm --filter @workspace/scripts run <script>`.
