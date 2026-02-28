import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, sessions } from '../db/schema.js';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'readonly';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Verify session token from cookie and attach user to request.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies.session;
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const [session] = await db
    .select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    return reply.status(401).send({ error: 'Session expired or invalid' });
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return reply.status(401).send({ error: 'User not found' });
  }

  request.user = user;
}

/**
 * Require admin role.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}

/**
 * Require at least user role (not readonly).
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.user?.role === 'readonly') {
    return reply.status(403).send({ error: 'Write access required' });
  }
}
