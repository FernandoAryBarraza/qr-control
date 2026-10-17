import { Router } from 'express';
import { DATA_PROVIDER } from '../data/config';
import { getPrisma } from '../data/prisma-client';

export const apiRouter = Router();

// GET /api/health — dev smoke / passthrough check (design §5). Proves the full chain:
// HTTP -> /api mount -> router -> Prisma client -> SQLite. The raw query is the
// connectivity check; `provider` is the active datasource marker (BR-18 lineage).
apiRouter.get('/health', async (_req, res) => {
  await getPrisma().$queryRaw`SELECT 1`;
  res.json({ status: 'ok', provider: DATA_PROVIDER });
});
