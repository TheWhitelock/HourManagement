import 'dotenv/config';
import { createApp } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 3001;

const { app } = await createApp();

app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
