import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/entries', async (_req, res) => {
  const entries = await prisma.entry.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(entries);
});

app.post('/api/entries', async (req, res) => {
  const { description, hours } = req.body;

  if (!description || typeof hours !== 'number') {
    res.status(400).json({ error: 'Description and hours are required.' });
    return;
  }

  const entry = await prisma.entry.create({
    data: {
      description,
      hours
    }
  });

  res.status(201).json(entry);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
