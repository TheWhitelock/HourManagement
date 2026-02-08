import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

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

export const createPrisma = (dbUrl = process.env.DATABASE_URL || 'file:./dev.db') => {
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter });
};

export const createApp = ({ dbUrl, prisma } = {}) => {
  const app = express();
  const client = prisma ?? createPrisma(dbUrl);

  app.use(cors());
  app.use(express.json());

  const getLatestEvent = async () =>
    client.clockEvent.findFirst({
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }]
    });

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
    const filters = {};

    if (from) {
      filters.gte = startOfDay(from);
    }
    if (to) {
      filters.lte = endOfDay(to);
    }

    const events = await client.clockEvent.findMany({
      where: Object.keys(filters).length ? { occurredAt: filters } : undefined,
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }]
    });

    res.json(events);
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
    const events = await client.clockEvent.findMany({
      where: { occurredAt: { lte: rangeEnd } },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }]
    });

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

    const event = await client.clockEvent.create({
      data: {
        type: 'IN',
        occurredAt: new Date()
      }
    });

    res.status(201).json(event);
  });

  app.post('/api/clock-out', async (_req, res) => {
    const { clockedIn, lastEvent } = await getClockStatus();
    if (!lastEvent || !clockedIn) {
      res.status(400).json({ error: 'Already clocked out.' });
      return;
    }

    const event = await client.clockEvent.create({
      data: {
        type: 'OUT',
        occurredAt: new Date()
      }
    });

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

    const event = await client.clockEvent.create({
      data: {
        type,
        occurredAt: parsed
      }
    });

    res.status(201).json(event);
  });

  app.get('/api/clock-events/:id/impact', async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid event id.' });
      return;
    }

    const existing = await client.clockEvent.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const currentStatus = await getClockStatus();
    const latestAfterDelete = await client.clockEvent.findFirst({
      where: { id: { not: id } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }]
    });

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

    const existing = await client.clockEvent.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    await client.clockEvent.delete({ where: { id } });

    res.json({
      deletedId: id,
      status: await getClockStatus()
    });
  });

  return { app, prisma: client };
};
