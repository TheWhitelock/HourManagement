import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const initSqlJs = require('sql.js');
const resolveWasm = () => require.resolve('sql.js/dist/sql-wasm.wasm');

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const exportDatabase = (db, filePath) => {
  const data = db.export();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(data));
  fs.renameSync(tempPath, filePath);
};

export const createDatabase = async (filePath) => {
  ensureDir(filePath);

  const SQL = await initSqlJs({
    locateFile: () => resolveWasm()
  });

  const exists = fs.existsSync(filePath);
  const fileBuffer = exists ? fs.readFileSync(filePath) : null;
  const db = new SQL.Database(fileBuffer || undefined);

  db.run(`
    CREATE TABLE IF NOT EXISTS clock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
      occurredAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  db.run(
    'CREATE INDEX IF NOT EXISTS idx_clock_events_occurred_at ON clock_events(occurredAt);'
  );

  if (!exists) {
    exportDatabase(db, filePath);
  }

  let writeQueue = Promise.resolve();

  const enqueueWrite = (fn) => {
    writeQueue = writeQueue.then(fn, fn);
    return writeQueue;
  };

  const all = (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  };

  const run = (sql, params = []) =>
    enqueueWrite(() => {
      db.run(sql, params);
      exportDatabase(db, filePath);
    });

  return { all, run, db, filePath };
};
