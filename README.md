# Hour Management

Local-first time tracking with a weekly dashboard, manual adjustments, and a simple clock-in/out flow. The app runs a React + Vite client alongside an Express API backed by SQLite.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express (REST)
- **Database:** SQLite via `sql.js` (WASM, file-backed)

## Getting Started

### Prerequisites

- Node.js 18+

### Install dependencies

```bash
npm install
```

### Configure the database

```bash
cp server/.env.example server/.env
```

Set `DB_PATH` to choose where the SQLite file lives. The database file is created automatically on first run.

### Optional: Configure the client API base

If the client is served from a `file://` URL (desktop wrapper), set an API base URL.

```bash
cp client/.env.example client/.env
```

### Start the app

```bash
npm run dev
```

- React app: <http://localhost:5173>
- API server: <http://localhost:3001>

## Desktop (Electron)

### Run in development

```bash
npm run desktop:dev
```

### Build a Windows installer

```bash
npm run electron:build
```

The installer is written to `dist-electron/` (for example `dist-electron/HourManagement-Setup-0.0.1.exe`).

### App icon

Electron Builder needs a Windows `.ico` file if you want a custom icon. Place it at
`electron/assets/icon.ico` and then add `"icon": "electron/assets/icon.ico"` under the
`build.win` section in `package.json`.

## REST API

### Clock status

- `GET /api/clock-status` → current status + latest event
- `POST /api/clock-in` → create an IN event for now
- `POST /api/clock-out` → create an OUT event for now

### Events

- `GET /api/clock-events?from=YYYY-MM-DD&to=YYYY-MM-DD` → list events in range
- `POST /api/clock-events` → create a manual event (must be in the past)
- `GET /api/clock-events/:id/impact` → see if deleting changes clock status
- `DELETE /api/clock-events/:id` → delete an event

Manual event payload:

```json
{
  "type": "IN",
  "occurredAt": "2024-06-05T09:15:00.000Z"
}
```

### Summaries

- `GET /api/clock-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` → daily totals for a range

## UI Highlights

- Weekly totals, averages, and best-day summaries.
- Manual event entry and deletion with impact preview.
- Settings stored in localStorage (target hours, chart scale).

## Electron-ready

The client + server can be bundled into Electron with minimal change. The REST endpoints and SQLite file are already local-first, which is ideal for Electron.
