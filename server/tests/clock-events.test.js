import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const testDbFilename = `dev.test.${Date.now()}.db`;
const testDbPath = path.join(serverRoot, testDbFilename);

const padNumber = (value) => String(value).padStart(2, '0');
const toDateKey = (date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const removeTestDb = () => {
  if (fs.existsSync(testDbPath)) {
    try {
      fs.rmSync(testDbPath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
};

describe('clock events API', () => {
  let app;
  let createApp;

  beforeAll(async () => {
    process.env.DB_PATH = testDbPath;
    removeTestDb();
    ({ createApp } = await import('../src/app.js'));
    const created = await createApp({ dbPath: testDbPath });
    app = created.app;
  });

  beforeEach(async () => {
    removeTestDb();
    const created = await createApp({ dbPath: testDbPath });
    app = created.app;
  });

  afterAll(async () => {
    removeTestDb();
  });

  it('clocks in and out successfully', async () => {
    const initialStatus = await request(app).get('/api/clock-status');
    expect(initialStatus.body.clockedIn).toBe(false);

    const clockIn = await request(app).post('/api/clock-in');
    expect(clockIn.status).toBe(201);

    const afterIn = await request(app).get('/api/clock-status');
    expect(afterIn.body.clockedIn).toBe(true);

    const clockOut = await request(app).post('/api/clock-out');
    expect(clockOut.status).toBe(201);

    const afterOut = await request(app).get('/api/clock-status');
    expect(afterOut.body.clockedIn).toBe(false);
  });

  it('rejects manual events in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const response = await request(app).post('/api/clock-events').send({
      type: 'IN',
      occurredAt: future
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/past/i);
  });

  it('updates an existing manual event', async () => {
    const original = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const updatedTime = new Date(Date.now() - 90 * 60 * 1000);

    const created = await request(app).post('/api/clock-events').send({
      type: 'IN',
      occurredAt: original.toISOString()
    });
    expect(created.status).toBe(201);

    const response = await request(app).put(`/api/clock-events/${created.body.id}`).send({
      type: 'OUT',
      occurredAt: updatedTime.toISOString()
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
    expect(response.body.type).toBe('OUT');
    expect(new Date(response.body.occurredAt).toISOString()).toBe(updatedTime.toISOString());
  });

  it('deleting the latest event updates status based on remaining events', async () => {
    const now = new Date();
    const t1 = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const t2 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const t3 = new Date(now.getTime() - 30 * 60 * 1000);

    await request(app).post('/api/clock-events').send({
      type: 'IN',
      occurredAt: t1.toISOString()
    });
    await request(app).post('/api/clock-events').send({
      type: 'OUT',
      occurredAt: t2.toISOString()
    });
    await request(app).post('/api/clock-events').send({
      type: 'IN',
      occurredAt: t3.toISOString()
    });

    const latestResponse = await request(app).get('/api/clock-status');
    const lastEvent = latestResponse.body.lastEvent;

    const response = await request(app).delete(`/api/clock-events/${lastEvent.id}`);
    expect(response.status).toBe(200);
    expect(response.body.status.clockedIn).toBe(false);
  });

  it('reports status change impact for deletions', async () => {
    const now = new Date();
    const t1 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const t2 = new Date(now.getTime() - 60 * 60 * 1000);

    await request(app).post('/api/clock-events').send({
      type: 'IN',
      occurredAt: t1.toISOString()
    });
    await request(app).post('/api/clock-events').send({
      type: 'OUT',
      occurredAt: t2.toISOString()
    });

    const latestResponse = await request(app).get('/api/clock-status');
    const latest = latestResponse.body.lastEvent;

    const response = await request(app).get(`/api/clock-events/${latest.id}/impact`);
    expect(response.status).toBe(200);
    expect(response.body.currentStatus).toBe('OUT');
    expect(response.body.willChangeStatus).toBe(true);
    expect(response.body.nextStatus).toBe('IN');
  });

  it('returns accurate daily summaries', async () => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const dayOne = new Date(base.getTime() - 3 * 24 * 60 * 60 * 1000);
    const dayTwo = new Date(base.getTime() - 2 * 24 * 60 * 60 * 1000);

    const events = [
      { type: 'IN', occurredAt: new Date(dayOne.setHours(9, 0, 0, 0)) },
      { type: 'OUT', occurredAt: new Date(dayOne.setHours(12, 0, 0, 0)) },
      { type: 'IN', occurredAt: new Date(dayOne.setHours(13, 0, 0, 0)) },
      { type: 'OUT', occurredAt: new Date(dayOne.setHours(17, 0, 0, 0)) },
      { type: 'IN', occurredAt: new Date(dayTwo.setHours(10, 0, 0, 0)) },
      { type: 'OUT', occurredAt: new Date(dayTwo.setHours(12, 30, 0, 0)) }
    ];

    for (const event of events) {
      await request(app).post('/api/clock-events').send({
        type: event.type,
        occurredAt: event.occurredAt.toISOString()
      });
    }

    const from = toDateKey(new Date(base.getTime() - 3 * 24 * 60 * 60 * 1000));
    const to = toDateKey(new Date(base.getTime() - 2 * 24 * 60 * 60 * 1000));

    const response = await request(app).get(`/api/clock-summary?from=${from}&to=${to}`);
    expect(response.status).toBe(200);

    const dayOneSummary = response.body.days.find((day) => day.date === from);
    const dayTwoSummary = response.body.days.find((day) => day.date === to);

    expect(dayOneSummary.totalHours).toBeCloseTo(7, 2);
    expect(dayTwoSummary.totalHours).toBeCloseTo(2.5, 2);
  });
});
