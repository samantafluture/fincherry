import Fastify from 'fastify';
import { createRequire } from 'node:module';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { uploadRoutes } from './routes/uploads.js';
import { loadEnvFile } from './utils/loadEnv.js';

loadEnvFile('../../.env');
loadEnvFile();

const require = createRequire(import.meta.url);
const hasPinoPretty = (() => {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
})();

const app = Fastify({
  maxParamLength: 500,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV !== 'production' && hasPinoPretty
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  },
});

// ── Plugins ──────────────────────────────────────────────────────────────

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
});

await app.register(cookie, {
  secret: process.env.JWT_SECRET ?? 'dev-cookie-secret',
});

await app.register(multipart);

// ── tRPC ─────────────────────────────────────────────────────────────────

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }: { path: string | undefined; error: Error }) {
      app.log.error({ path, message: error.message }, 'tRPC error');
    },
  },
});

// ── REST routes ──────────────────────────────────────────────────────────

await app.register(uploadRoutes);

// Health check
app.get('/api/health', async () => ({
  status: 'ok',
  time: new Date().toISOString(),
  env: process.env.NODE_ENV,
}));

// ── Start ────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`FinCherry API running on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
