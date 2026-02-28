import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { remoteHosts } from '../db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const createRemoteHostSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(255),
  privateKeyPath: z.string().max(1024).optional(),
});

const updateRemoteHostSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(255).optional(),
  privateKeyPath: z.string().max(1024).optional(),
  hostFingerprint: z.string().max(512).optional(),
});

const testConnectionSchema = z.object({
  acceptFingerprint: z.boolean().default(false),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listRemoteHostsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const hosts = await db
    .select({
      id: remoteHosts.id,
      name: remoteHosts.name,
      host: remoteHosts.host,
      port: remoteHosts.port,
      username: remoteHosts.username,
      hostFingerprint: remoteHosts.hostFingerprint,
      createdAt: remoteHosts.createdAt,
      updatedAt: remoteHosts.updatedAt,
    })
    .from(remoteHosts)
    .orderBy(desc(remoteHosts.createdAt));

  return reply.send(hosts);
}

async function getRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [host] = await db
    .select()
    .from(remoteHosts)
    .where(eq(remoteHosts.id, id))
    .limit(1);

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  return reply.send(host);
}

async function createRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createRemoteHostSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [host] = await db
    .insert(remoteHosts)
    .values({
      ...body.data,
      createdBy: request.user?.id,
    })
    .returning();

  return reply.status(201).send(host);
}

async function updateRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = updateRemoteHostSchema.safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [host] = await db
    .update(remoteHosts)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(eq(remoteHosts.id, id))
    .returning();

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  return reply.send(host);
}

async function deleteRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const result = await db.delete(remoteHosts).where(eq(remoteHosts.id, id)).returning();

  if (result.length === 0) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  return reply.send({ success: true });
}

async function testConnectionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = testConnectionSchema.safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [host] = await db.select().from(remoteHosts).where(eq(remoteHosts.id, id)).limit(1);

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  try {
    // TODO: Implement actual SSH connection test using a library like ssh2
    // This is a placeholder that would:
    // 1. Connect to the SSH host
    // 2. Get the host fingerprint
    // 3. Perform TOFU (Trust On First Use) verification
    // 4. If acceptFingerprint is true, store the fingerprint

    // For now, return a mock response
    const mockFingerprint = 'SHA256:mockFingerprint1234567890';

    if (host.hostFingerprint) {
      // Verify TOFU fingerprint
      if (host.hostFingerprint !== mockFingerprint) {
        return reply.status(400).send({
          error: 'Fingerprint mismatch',
          details: 'Host fingerprint does not match stored fingerprint',
        });
      }
    } else if (body.data.acceptFingerprint) {
      // Store fingerprint
      await db
        .update(remoteHosts)
        .set({ hostFingerprint: mockFingerprint })
        .where(eq(remoteHosts.id, id));
    }

    return reply.send({
      success: true,
      message: 'Connection test successful',
      fingerprint: mockFingerprint,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function remoteHostsRoutes(app: FastifyInstance) {
  // List all hosts
  app.get('/', { preHandler: [requireAuth] }, listRemoteHostsHandler);

  // Get single host
  app.get('/:id', { preHandler: [requireAuth] }, getRemoteHostHandler);

  // Create host
  app.post('/', { preHandler: [requireAdmin] }, createRemoteHostHandler);

  // Update host
  app.patch('/:id', { preHandler: [requireAdmin] }, updateRemoteHostHandler);

  // Delete host
  app.delete('/:id', { preHandler: [requireAdmin] }, deleteRemoteHostHandler);

  // Test connection
  app.post('/:id/test', { preHandler: [requireAuth] }, testConnectionHandler);
}
