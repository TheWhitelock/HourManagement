import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createDatabase } from './db.js';

const padNumber = (value) => String(value).padStart(2, '0');
const toDateKey = (date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const parseDateParam = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const addIntervalMinutes = (totals, start, end) => {
  if (end <= start) {
    return;
  }

  let cursor = new Date(start);
  while (cursor < end) {
    const dayEnd = endOfDay(cursor);
    const segmentEnd = dayEnd < end ? dayEnd : end;
    const key = toDateKey(cursor);
    const minutes = (segmentEnd - cursor) / 60000;
    totals[key] = (totals[key] || 0) + minutes;
    cursor = new Date(segmentEnd.getTime() + 1);
  }
};

const computeDailySummary = (events, rangeStart, rangeEnd, now) => {
  const totals = {};
  let currentIn = null;

  for (const event of events) {
    if (event.occurredAt < rangeStart) {
      if (event.type === 'IN') {
        currentIn = event.occurredAt;
      } else {
        currentIn = null;
      }
      continue;
    }

    if (event.occurredAt > rangeEnd) {
      break;
    }

    if (event.type === 'IN') {
      if (currentIn) {
        addIntervalMinutes(totals, currentIn, event.occurredAt);
      }
      currentIn = event.occurredAt;
    } else if (currentIn) {
      addIntervalMinutes(totals, currentIn, event.occurredAt);
      currentIn = null;
    }
  }

  if (currentIn) {
    const cap = now < rangeEnd ? now : rangeEnd;
    if (cap > currentIn) {
      addIntervalMinutes(totals, currentIn, cap);
    }
  }

  const days = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const key = toDateKey(cursor);
    const minutes = totals[key] || 0;
    days.push({
      date: key,
      totalMinutes: Math.round(minutes),
      totalHours: Number((minutes / 60).toFixed(2))
    });
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return days;
};

const resolveDbPath = (dbPath = process.env.DB_PATH || './dev.db') =>
  dbPath && path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);

const mapEvent = (row) =>
  row
    ? {
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt
      }
    : null;

export const createApp = async ({ dbPath } = {}) => {
  const app = express();
  const db = await createDatabase(resolveDbPath(dbPath));

  app.use(cors());
  app.use(express.json());

  const getLatestEvent = async () => {
    const rows = db.all(
      `SELECT id, type, occurredAt, createdAt
       FROM clock_events
       ORDER BY datetime(occurredAt) DESC, datetime(createdAt) DESC
       LIMIT 1`
    );
    return mapEvent(rows[0]);
  };

  const getEventById = (id) => {
    const rows = db.all(
      `SELECT id, type, occurredAt, createdAt
       FROM clock_events
       WHERE id = ?`,
      [id]
    );
    return mapEvent(rows[0]);
  };

  const getLastInsertId = () => {
    const rows = db.all('SELECT last_insert_rowid() as id');
    return rows[0]?.id;
  };

  const getClockStatus = async () => {
    const lastEvent = await getLatestEvent();
    return {
      clockedIn: lastEvent?.type === 'IN',
      lastEvent
    };
  };

  app.get('/api/clock-status', async (_req, res) => {
    const status = await getClockStatus();
    res.json(status);
  });

  app.get('/api/clock-events', async (req, res) => {
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    const params = [];
    let where = '';

    if (from) {
      params.push(startOfDay(from).toISOString());
      where += params.length === 1 ? 'WHERE occurredAt >= ?' : ' AND occurredAt >= ?';
    }
    if (to) {
      params.push(endOfDay(to).toISOString());
      where += params.length === 1 ? 'WHERE occurredAt <= ?' : ' AND occurredAt <= ?';
    }

    const rows = db.all(
      `SELECT id, type, occurredAt, createdAt
       FROM clock_events
       ${where}
       ORDER BY datetime(occurredAt) ASC, datetime(createdAt) ASC`,
      params
    );

    res.json(rows.map(mapEvent));
  });

  app.get('/api/clock-summary', async (req, res) => {
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);

    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required (YYYY-MM-DD).' });
      return;
    }

    const rangeStart = startOfDay(from);
    const rangeEnd = endOfDay(to);
    const rows = db.all(
      `SELECT id, type, occurredAt, createdAt
       FROM clock_events
       WHERE occurredAt <= ?
       ORDER BY datetime(occurredAt) ASC, datetime(createdAt) ASC`,
      [rangeEnd.toISOString()]
    );
    const events = rows.map((row) => ({
      ...mapEvent(row),
      occurredAt: new Date(row.occurredAt)
    }));

    const summary = computeDailySummary(events, rangeStart, rangeEnd, new Date());
    res.json({
      range: { from: toDateKey(rangeStart), to: toDateKey(rangeEnd) },
      days: summary
    });
  });

  app.post('/api/clock-in', async (_req, res) => {
    const { clockedIn } = await getClockStatus();
    if (clockedIn) {
      res.status(400).json({ error: 'Already clocked in.' });
      return;
    }

    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO clock_events (type, occurredAt, createdAt) VALUES (?, ?, ?)`,
      ['IN', now, now]
    );

    const event = getEventById(getLastInsertId());
    res.status(201).json(event);
  });

  app.post('/api/clock-out', async (_req, res) => {
    const { clockedIn, lastEvent } = await getClockStatus();
    if (!lastEvent || !clockedIn) {
      res.status(400).json({ error: 'Already clocked out.' });
      return;
    }

    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO clock_events (type, occurredAt, createdAt) VALUES (?, ?, ?)`,
      ['OUT', now, now]
    );

    const event = getEventById(getLastInsertId());
    res.status(201).json(event);
  });

  app.post('/api/clock-events', async (req, res) => {
    const { type, occurredAt } = req.body;
    const now = new Date();
    const parsed = new Date(occurredAt);

    if (!['IN', 'OUT'].includes(type)) {
      res.status(400).json({ error: 'Type must be IN or OUT.' });
      return;
    }

    if (!occurredAt || Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'Valid occurredAt timestamp is required.' });
      return;
    }

    if (parsed >= now) {
      res.status(400).json({ error: 'Manual events must be in the past.' });
      return;
    }

    const createdAt = new Date().toISOString();
    await db.run(
      `INSERT INTO clock_events (type, occurredAt, createdAt) VALUES (?, ?, ?)`,
      [type, parsed.toISOString(), createdAt]
    );

    const event = getEventById(getLastInsertId());
    res.status(201).json(event);
  });

  app.get('/api/clock-events/:id/impact', async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid event id.' });
      return;
    }

    const existingRows = db.all(
      `SELECT id, type, occurredAt, createdAt FROM clock_events WHERE id = ?`,
      [id]
    );
    const existing = mapEvent(existingRows[0]);
    if (!existing) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const currentStatus = await getClockStatus();
    const remainingRows = db.all(
      `SELECT id, type, occurredAt, createdAt
       FROM clock_events
       WHERE id != ?
       ORDER BY datetime(occurredAt) DESC, datetime(createdAt) DESC
       LIMIT 1`,
      [id]
    );
    const latestAfterDelete = mapEvent(remainingRows[0]);

    const nextClockedIn = latestAfterDelete?.type === 'IN';
    res.json({
      willChangeStatus: currentStatus.clockedIn !== nextClockedIn,
      currentStatus: currentStatus.clockedIn ? 'IN' : 'OUT',
      nextStatus: nextClockedIn ? 'IN' : 'OUT'
    });
  });

  app.delete('/api/clock-events/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid event id.' });
      return;
    }

    const existingRows = db.all(
      `SELECT id, type, occurredAt, createdAt FROM clock_events WHERE id = ?`,
      [id]
    );
    const existing = mapEvent(existingRows[0]);
    if (!existing) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    await db.run(`DELETE FROM clock_events WHERE id = ?`, [id]);

    res.json({
      deletedId: id,
      status: await getClockStatus()
    });
  });

  return { app, db };
};
