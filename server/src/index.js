import { createRequire } from 'node:module';
import { createApp } from './app.js';

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

log('server: starting');
log(`server: cwd=${process.cwd()}`);
log(`server: execPath=${process.execPath}`);
log(`server: argv0=${process.argv0}`);
log(`server: argv=${process.argv.join(' ')}`);
log(`server: importMeta=${import.meta.url}`);

const require = createRequire(import.meta.url);
const dotenvPaths = require.resolve.paths('dotenv') || [];
log(`server: dotenv search paths=${dotenvPaths.join(';')}`);

try {
  require('dotenv/config');
  log('server: dotenv loaded');
} catch (error) {
  if (error?.code === 'MODULE_NOT_FOUND') {
    log('server: dotenv not found, continuing without it');
  } else {
    log(`server: dotenv load error=${error?.message || String(error)}`);
    throw error;
  }
}

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 3001;

const { app } = await createApp();

app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
