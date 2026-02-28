import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { librariesRoutes } from './routes/libraries.js';
import { browseRoutes } from './routes/browse.js';
import { albumsRoutes } from './routes/albums.js';
import { tracksRoutes } from './routes/tracks.js';
import { playlistsRoutes } from './routes/playlists.js';
import { collectionsRoutes } from './routes/collections.js';
import { remoteHostsRoutes } from './routes/remoteHosts.js';
import { streamRoutes } from './routes/stream.js';
import { eventsRoutes } from './routes/events.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// ─── Security & Middleware ────────────────────────────────────────────

await app.register(helmet, {
  contentSecurityPolicy: config.NODE_ENV === 'production',
});

await app.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

await app.register(cookie, {
  secret: config.SESSION_SECRET,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// ─── Routes ──────────────────────────────────────────────────────────

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(librariesRoutes, { prefix: '/api/libraries' });
await app.register(browseRoutes, { prefix: '/api/browse' });
await app.register(albumsRoutes, { prefix: '/api/albums' });
await app.register(tracksRoutes, { prefix: '/api/tracks' });
await app.register(playlistsRoutes, { prefix: '/api/playlists' });
await app.register(collectionsRoutes, { prefix: '/api/collections' });
await app.register(remoteHostsRoutes, { prefix: '/api/remote-hosts' });
await app.register(streamRoutes, { prefix: '/api/stream' });
await app.register(eventsRoutes, { prefix: '/api/events' });

// ─── Health Check ────────────────────────────────────────────────────

app.get('/api/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '0.1.0',
}));

// ─── Start ───────────────────────────────────────────────────────────

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Resonance server running on ${config.HOST}:${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
