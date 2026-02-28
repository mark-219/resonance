import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, count as countFn } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const setupSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(8),
});

const createUserSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['admin', 'user', 'readonly']).optional(),
  displayName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(1).max(255).optional(),
  displayName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  role: z.enum(['admin', 'user', 'readonly']).optional(),
  avatarUrl: z.string().max(1024).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Column selection (excludes passwordHash) ─────────────────────────

const userColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  email: users.email,
  avatarUrl: users.avatarUrl,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

// ─── Route handlers ──────────────────────────────────────────────────

async function setupHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = setupSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Check if any admin already exists
  const [result] = await db
    .select({ total: countFn() })
    .from(users)
    .where(eq(users.role, 'admin'));

  if (Number(result.total) > 0) {
    return reply
      .status(403)
      .send({ error: 'Setup already completed. An admin user exists.' });
  }

  const { username, password } = body.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role: 'admin' })
    .returning(userColumns);

  return reply.status(201).send(user);
}

async function listUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = paginationSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset } = query.data;

  const [data, count] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: countFn() }).from(users),
  ]);

  return reply.send({
    data,
    pagination: {
      limit,
      offset,
      total: Number(count[0].total),
    },
  });
}

async function getUserHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  // Allow admin or self
  if (request.user?.role !== 'admin' && request.user?.id !== id) {
    return reply.status(403).send({ error: 'Admin access required' });
  }

  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }

  return reply.send(user);
}

async function createUserHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createUserSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  const { username, password, role, displayName, email } = body.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role: role ?? 'user', displayName, email })
    .returning(userColumns);

  return reply.status(201).send(user);
}

async function updateUserHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const isSelf = request.user?.id === id;
  const isAdmin = request.user?.role === 'admin';

  // Allow admin or self
  if (!isAdmin && !isSelf) {
    return reply.status(403).send({ error: 'Admin access required' });
  }

  const body = updateUserSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Non-admin cannot change role
  const updateData = { ...body.data };
  if (!isAdmin) {
    delete updateData.role;
  }

  const [user] = await db
    .update(users)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(userColumns);

  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }

  return reply.send(user);
}

async function deleteUserHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  if (request.user?.id === id) {
    return reply.status(400).send({ error: 'Cannot delete your own account' });
  }

  const result = await db.delete(users).where(eq(users.id, id)).returning();

  if (result.length === 0) {
    return reply.status(404).send({ error: 'User not found' });
  }

  return reply.send({ success: true });
}

async function changePasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const isSelf = request.user?.id === id;
  const isAdmin = request.user?.role === 'admin';

  // Allow admin or self
  if (!isAdmin && !isSelf) {
    return reply.status(403).send({ error: 'Admin access required' });
  }

  const body = changePasswordSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Self-updating requires current password
  if (isSelf && !isAdmin) {
    if (!body.data.currentPassword) {
      return reply.status(400).send({ error: 'Current password is required' });
    }

    const [existing] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing || !existing.passwordHash) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const match = await bcrypt.compare(body.data.currentPassword, existing.passwordHash);
    if (!match) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }
  }

  const passwordHash = await bcrypt.hash(body.data.newPassword, 10);

  const [user] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(userColumns);

  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }

  return reply.send({ success: true });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function usersRoutes(app: FastifyInstance) {
  // Bootstrap first admin (no auth required)
  app.post('/setup', setupHandler);

  // List users
  app.get('/', { preHandler: [requireAdmin] }, listUsersHandler);

  // Get single user (admin or self)
  app.get('/:id', { preHandler: [requireAuth] }, getUserHandler);

  // Create user
  app.post('/', { preHandler: [requireAdmin] }, createUserHandler);

  // Update user (admin or self)
  app.patch('/:id', { preHandler: [requireAuth] }, updateUserHandler);

  // Delete user
  app.delete('/:id', { preHandler: [requireAdmin] }, deleteUserHandler);

  // Change password (admin or self)
  app.post('/:id/password', { preHandler: [requireAuth] }, changePasswordHandler);
}
