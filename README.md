# Know Your World

A K12 geography quiz game built with React, Vite, and Cloudflare Workers. Players enter their name, pick a continent → category → difficulty, and answer 8 questions plus 2 fun-fact cards per level. Scores persist to a Cloudflare D1 database and live leaderboards rank players per track.

**Live site:** https://know-your-world.vercel.app
**API:** https://know-your-world-api.morphylee22.workers.dev

## Features

- **Name-based play** — no accounts, no auth. Player name persists in localStorage.
- **4 continents × 4 categories × 3 difficulty levels** — 48 tracks total.
- **Relational HUD** — question counter, score, level indicator, and "max possible score" all update live as the player advances.
- **K12-friendly SFX** — 9 synthesized sounds (correct, wrong, streak, level passed, etc.) via Web Audio API. Default ON, mute toggle persists.
- **Level unlocks** — pass Easy (≥4/8) to unlock Medium, pass Medium to unlock Hard.
- **Best-score tracking** — per-track best scores saved locally and displayed on selection screens.
- **Leaderboards** — global leaderboards per track, with the current player's row highlighted.
- **Kid-safe names** — profanity filter with leetspeak normalization blocks inappropriate names at the API.
- **Fun facts** — each level includes 2 "Did you know?" cards. These are random educational facts and do **not** count toward the score or question count.

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend (Vercel)                  │
│  know-your-world.vercel.app         │
│  React 19 + Vite 7 + TypeScript     │
│  - Game UI, HUD, SFX                │
│  - localStorage: name, progress,    │
│    mute preference                  │
└──────────────┬──────────────────────┘
               │ fetch() over HTTPS
               ▼
┌─────────────────────────────────────┐
│  Backend API (Cloudflare Worker)    │
│  know-your-world-api                │
│  .morphylee22.workers.dev           │
│  Hono + Workers runtime             │
│  - POST /api/scores                 │
│  - GET  /api/leaderboards           │
│  - GET  /api/healthz                │
└──────────────┬──────────────────────┘
               │ SQL over D1 binding
               ▼
┌─────────────────────────────────────┐
│  D1 Database (Cloudflare, APAC)     │
│  know-your-world-db                 │
│  SQLite at the edge                 │
└─────────────────────────────────────┘
```

The frontend is a static single-page app hosted on Vercel. The backend is a Cloudflare Worker with a D1 SQLite database. The two communicate over HTTPS with CORS locked to the production frontend origin.

## Repository Structure

```
know-your-world/
├── artifacts/
│   └── know-your-world/          # React + Vite quiz app (the game)
│       ├── src/
│       │   ├── App.tsx           # Main app, all screens, game flow
│       │   ├── data/             # Question data (africa.ts, asia.ts, etc.)
│       │   ├── hooks/
│       │   │   ├── usePlayer.ts  # localStorage-backed name persistence
│       │   │   ├── useSfx.ts     # Web Audio synthesized SFX engine
│       │   │   ├── useScores.ts  # API client (score submission, leaderboards)
│       │   │   └── useProgress.ts # localStorage-backed level unlocks + best scores
│       │   └── index.css         # All styling
│       ├── vite.config.ts
│       └── package.json
├── worker/                       # Cloudflare Worker API (standalone, not in pnpm workspace)
│   ├── src/
│   │   ├── index.ts              # Hono app: 3 endpoints, CORS, validation
│   │   └── profanity.ts          # K12 profanity filter with leetspeak normalization
│   ├── schema.sql                # D1 schema (scores table + indexes)
│   ├── wrangler.toml             # Worker config + D1 binding
│   └── package.json
├── scripts/                      # Utility scripts (workspace package)
├── vercel.json                   # Frontend build config for Vercel
├── pnpm-workspace.yaml           # Workspace: artifacts/* + scripts (worker excluded)
└── package.json                  # Root: shared devDeps, build/typecheck/format scripts
```

## Prerequisites

- **Node.js 24+**
- **pnpm 9+** (`npm install -g pnpm`)
- **Cloudflare account** (for the Worker + D1) — only needed if deploying the backend
- **Vercel account** (for the frontend) — only needed if deploying the frontend

## Local Development

### Frontend

```bash
# From the repo root
pnpm install

# Start the Vite dev server (defaults to port 5173)
cd artifacts/know-your-world
PORT=5173 BASE_PATH=/ pnpm run dev
```

Open http://localhost:5173 in your browser.

### Backend Worker

```bash
cd worker
npm install

# Start the local Wrangler dev server (defaults to port 8787)
npx wrangler dev
```

The Worker will be at http://localhost:8787. To point the frontend at the local Worker instead of the production one, set `VITE_API_BASE` before starting the Vite dev server:

```bash
# From the repo root
VITE_API_BASE=http://localhost:8787 pnpm --filter @workspace/know-your-world run dev
```

### Local D1 database

To run the Worker against a local D1 database (instead of the remote one):

```bash
cd worker
npx wrangler d1 execute know-your-world-db --local --file=./schema.sql
```

Wrangler creates a local SQLite file under `.wrangler/`. The `--local` flag in `wrangler dev` will automatically use it.

## Deployment

### Frontend → Vercel

The frontend auto-deploys on every push to `main` via the Vercel GitHub integration. The `vercel.json` at the repo root configures:

- **Build command:** `pnpm --filter @workspace/know-your-world run build`
- **Output directory:** `artifacts/know-your-world/dist/public`
- **Install command:** `pnpm install --no-frozen-lockfile`
- **Framework:** Vite

Production URL: https://know-your-world.vercel.app

### Backend → Cloudflare Workers

The Worker is deployed manually via Wrangler. From the `worker/` directory:

```bash
# Set your Cloudflare API token (create one at https://dash.cloudflare.com/profile/api-tokens
# with permissions: Account > Workers Scripts > Edit, Account > D1 > Edit,
# Account > Account Settings > Read)
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

# First-time only: create the D1 database
npx wrangler d1 create know-your-world-db
# Then paste the returned database_id into wrangler.toml

# First-time only: run the schema migration
npx wrangler d1 execute know-your-world-db --remote --file=./schema.sql

# Deploy the Worker
npx wrangler deploy
```

The Worker will be live at `https://know-your-world-api.<your-subdomain>.workers.dev`.

**Note:** The `wrangler.toml` in this repo contains the production `database_id`. This is not a secret — D1 database IDs are not sensitive. The actual secret (your Cloudflare API token) is never committed and must be set as an environment variable.

## Environment Variables

### Frontend (Vite)

| Variable        | Required | Default                                               | Purpose                                                                              |
| --------------- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `VITE_API_BASE` | No       | `https://know-your-world-api.morphylee22.workers.dev` | Base URL of the Worker API. Override for local dev or a different deployment.        |
| `PORT`          | No       | `5173`                                                | Vite dev server port. Also read by Vercel in production.                             |
| `BASE_PATH`     | No       | `/`                                                   | Vite base path. Set to `/` for Vercel, or a subpath if hosting under a route prefix. |

### Backend (Cloudflare Worker)

Configured in `worker/wrangler.toml` under `[vars]`:

| Variable            | Value                                | Purpose                                                    |
| ------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `CORS_ORIGIN`       | `https://know-your-world.vercel.app` | Allowed origin for browser requests.                       |
| `LEADERBOARD_LIMIT` | `10`                                 | Default number of entries returned by `/api/leaderboards`. |
| `MAX_NAME_LENGTH`   | `20`                                 | Maximum player name length.                                |

Secrets (Cloudflare API token, etc.) are **never** committed to the repo. Set them as environment variables before running `wrangler deploy`.

## API Reference

### `GET /api/healthz`

Health check. Returns `{"status":"ok","service":"know-your-world-api","time":<ms>}`.

### `POST /api/scores`

Submit a quiz score.

**Request body:**

```json
{
  "name": "Faiza",
  "continent": "africa",
  "category": "capitals",
  "level": "easy",
  "score": 6,
  "total": 8,
  "timeMs": 45000,
  "passed": true
}
```

**Response:**

```json
{
  "id": 1,
  "rank": 1,
  "totalEntries": 1,
  "percentile": 100,
  "isHighScore": true,
  "personalBest": 6
}
```

Same name on the same track is deduped — only the highest score (or fastest time at equal score) is kept.

### `GET /api/leaderboards?continent=&category=&level=&limit=`

Fetch the top entries for a track.

**Query params:**

- `continent` — `africa` | `asia` | `europe` | `americas`
- `category` — `capitals` | `presidents` | `flags` | `currencies`
- `level` — `easy` | `medium` | `hard`
- `limit` — 1 to 50 (default 10)

**Response:**

```json
{
  "track": { "continent": "africa", "category": "capitals", "level": "easy" },
  "entries": [
    {
      "rank": 1,
      "name": "Faiza",
      "score": 8,
      "total": 8,
      "timeMs": 30000,
      "passed": true,
      "createdAt": 1786425707
    }
  ],
  "totalEntries": 1
}
```

## Scoring Rules

- Each level has **8 questions** and **2 fun-fact cards**, shuffled together into a 10-item queue.
- **Only questions count toward the score.** Fun-fact cards do not increment the score, the question counter, or the questions-answered count. They are educational interludes.
- **Pass threshold:** 4 out of 8 questions correct (50%).
- **Level unlocks:** passing Easy unlocks Medium; passing Medium unlocks Hard.
- **Best score:** per (continent, category, level), stored in localStorage. Only the highest score is kept.

## Kid Safety

- **Profanity filter:** names are checked against a K12-appropriate blocklist at the API. Leetspeak normalization (`@` → `a`, `$` → `s`, `0` → `o`, etc.) catches obfuscated profanity. Rejected names get a friendly error message.
- **Name length:** maximum 20 characters.
- **No PII collected:** no email, no accounts, no cookies. Only the player's chosen name, quiz track, score, and timing are stored.
- **SFX design:** all sounds are ≤1.5 seconds, no harsh transients, no sub-200 Hz frequencies (kid-safe loudness, cheap-speaker friendly). Default ON with an obvious mute toggle.

## Tech Stack

| Layer              | Technology                                                |
| ------------------ | --------------------------------------------------------- |
| Frontend           | React 19, Vite 7, TypeScript 5.9                          |
| Backend            | Hono, Cloudflare Workers, TypeScript                      |
| Database           | Cloudflare D1 (SQLite at the edge)                        |
| Hosting (frontend) | Vercel                                                    |
| Hosting (backend)  | Cloudflare Workers                                        |
| Package manager    | pnpm 9 (workspace) for frontend, npm for Worker           |
| Audio              | Web Audio API (synthesized, no audio assets shipped)      |
| CI/CD              | Vercel GitHub integration (auto-deploy on push to `main`) |

## Scripts

### Root (`package.json`)

| Script                  | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `pnpm run build`        | Typecheck + build the quiz app            |
| `pnpm run typecheck`    | Run `tsc --noEmit` in the quiz app        |
| `pnpm run format`       | Run Prettier on the whole repo            |
| `pnpm run format:check` | Check Prettier formatting without writing |
| `pnpm run lint`         | Alias for `format:check`                  |

### Frontend (`artifacts/know-your-world/package.json`)

| Script               | Purpose                              |
| -------------------- | ------------------------------------ |
| `pnpm run dev`       | Start Vite dev server                |
| `pnpm run build`     | Production build to `dist/public/`   |
| `pnpm run serve`     | Preview the production build locally |
| `pnpm run typecheck` | `tsc --noEmit`                       |

### Worker (`worker/package.json`)

| Script                     | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `npm run dev`              | Start Wrangler dev server                |
| `npm run deploy`           | Deploy Worker to Cloudflare              |
| `npm run db:create`        | Create the D1 database (first-time only) |
| `npm run db:migrate`       | Run schema migration on remote D1        |
| `npm run db:migrate:local` | Run schema migration on local D1         |
| `npm run typecheck`        | `tsc --noEmit`                           |

## License

MIT

## Credits

Developed by Faiza Fadipe, 2025.
