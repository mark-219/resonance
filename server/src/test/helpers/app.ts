import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { config } from '../../config.js';
import { usersRoutes } from '../../routes/users.js';
import { authRoutes } from '../../routes/auth.js';
import { streamRoutes } from '../../routes/stream.js';

export async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  await app.register(usersRoutes, { prefix: '/api/users' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(streamRoutes, { prefix: '/api/stream' });

  await app.ready();
  return app;
}
