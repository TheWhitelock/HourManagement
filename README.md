# Hour Management

Local-first time tracking with a weekly dashboard, manual adjustments, and a simple clock-in/out flow. The app runs a React + Vite client alongside an Express API backed by SQLite.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express (REST)
- **Database:** SQLite via Prisma + `@libsql/client` adapter

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
npm run prisma:migrate --workspace server -- --name init
```

### Start the app

```bash
npm run dev
```

- React app: <http://localhost:5173>
- API server: <http://localhost:3001>

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
