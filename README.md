# Hour Management

Local-first time tracking with a weekly dashboard, clock in/out actions, and manual event management.
The app runs a React + Vite client with an Express API backed by SQLite (`sql.js`, file-backed).

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express (REST API)
- Database: SQLite via `sql.js` (WASM + on-disk DB file)
- Desktop: Electron + electron-builder

## Prerequisites

- Node.js 18+

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure server environment

```bash
cp server/.env.example server/.env
```

Default values:

- `DB_PATH="./dev.db"`
- `HOST="127.0.0.1"`
- `PORT=3001`

The database file is created automatically on first run.

### 3) (Optional) Configure client API base

```bash
cp client/.env.example client/.env
```

`VITE_API_BASE` is mainly useful when the client is loaded from `file://` (for example in Electron).

### 4) Run web app (client + server)

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://127.0.0.1:3001>

## Desktop (Electron)

### Run desktop app in development

```bash
npm run desktop:dev
```

This starts:

- Vite dev server
- Express API server
- Electron app pointed at the Vite URL

### Build Windows installer

```bash
npm run electron:build
```

Output is written to `dist-electron/` (for example `dist-electron/Liliance-Setup-0.2.0.exe`).

### Desktop data location

In packaged Electron builds, the server DB is stored in Electron user data as:

- `hour-management.db`

You can open that folder from the app Settings modal (`Open data folder`) and export a `.db` backup (`Export backup`).

## Scripts

From repo root:

- `npm run dev` - run client + server
- `npm run desktop:dev` - run client + server + Electron dev shell
- `npm run build` - build client only
- `npm run build:electron-client` - build client with Electron base path
- `npm run build:server-deps` - install production-only server deps
- `npm run electron:build` - build desktop installer
- `npm run lint` - lint client
- `npm run format` - format repo with Prettier

Workspace tests:

- `npm run test --workspace client`
- `npm run test --workspace server`

## REST API

### Clock status

- `GET /api/clock-status` -> current clocked-in state + latest event
- `POST /api/clock-in` -> create an `IN` event for now
- `POST /api/clock-out` -> create an `OUT` event for now

### Events

- `GET /api/clock-events?from=YYYY-MM-DD&to=YYYY-MM-DD` -> list events in range
- `POST /api/clock-events` -> create manual event (must be in the past)
- `PUT /api/clock-events/:id` -> update manual event (must be in the past)
- `GET /api/clock-events/:id/impact` -> preview status impact before delete
- `DELETE /api/clock-events/:id` -> delete event

Manual create/update payload:

```json
{
  "type": "IN",
  "occurredAt": "2024-06-05T09:15:00.000Z"
}
```

### Summary

- `GET /api/clock-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` -> daily totals for range

## UI Highlights

- Weekly chart with per-day totals, weekly total, daily average, and best day.
- Week navigation with selectable day columns and event list by selected date.
- One-click clock in / clock out controls.
- Manual past event add/edit/delete flows.
- Delete impact preview when a removal may change current status.
- Local settings persistence (`targetHours`, chart max scale) via `localStorage`.
- Server online/offline indicator.
