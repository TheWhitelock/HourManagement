# Hour Management

A local-first hour tracking starter kit built with React, Express, and SQLite. The stack is designed to stay lightweight today while leaving the door open for an Electron wrapper later.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express (REST)
- **Database:** SQLite via Prisma

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

- `GET /api/entries` → list entries
- `POST /api/entries` → create an entry

```json
{
  "description": "Client work",
  "hours": 2.5
}
```

## Electron-ready

When you are ready to package this as a desktop app, the client and server can be bundled into Electron with minimal change. The REST endpoints and SQLite file are already local-first, which is ideal for Electron.
