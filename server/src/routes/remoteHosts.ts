import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client as SSHClient } from 'ssh2';
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
      privateKeyPath: remoteHosts.privateKeyPath,
      hostFingerprint: remoteHosts.hostFingerprint,
      createdAt: remoteHosts.createdAt,
      updatedAt: remoteHosts.updatedAt,
    })
    .from(remoteHosts)
    .orderBy(desc(remoteHosts.createdAt));

  return reply.send(
    hosts.map(({ privateKeyPath, ...rest }) => ({
      ...rest,
      hasPrivateKey: !!privateKeyPath,
    }))
  );
}

async function getRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [host] = await db
    .select({
      id: remoteHosts.id,
      name: remoteHosts.name,
      host: remoteHosts.host,
      port: remoteHosts.port,
      username: remoteHosts.username,
      privateKeyPath: remoteHosts.privateKeyPath,
      hostFingerprint: remoteHosts.hostFingerprint,
      createdAt: remoteHosts.createdAt,
      updatedAt: remoteHosts.updatedAt,
    })
    .from(remoteHosts)
    .where(eq(remoteHosts.id, id))
    .limit(1);

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  const { privateKeyPath, ...rest } = host;
  return reply.send({ ...rest, hasPrivateKey: !!privateKeyPath });
}

async function createRemoteHostHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createRemoteHostSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
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
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
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
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [host] = await db
    .select()
    .from(remoteHosts)
    .where(eq(remoteHosts.id, id))
    .limit(1);

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  try {
    // Read private key if configured
    let privateKey: Buffer | undefined;
    if (host.privateKeyPath) {
      try {
        privateKey = readFileSync(host.privateKeyPath);
      } catch (err) {
        return reply.send({
          success: false,
          message: `Cannot read private key: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }

    // Perform real SSH connection test
    const result = await new Promise<{ fingerprint: string }>((resolve, reject) => {
      const conn = new SSHClient();
      let fingerprint = 'unknown';
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timed out after 10 seconds'));
      }, 10_000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.end();
        resolve({ fingerprint });
      });

      conn.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect({
        host: host.host,
        port: host.port,
        username: host.username,
        ...(privateKey ? { privateKey } : {}),
        // If no private key, ssh2 will attempt agent-based auth
        agent: !privateKey ? process.env.SSH_AUTH_SOCK : undefined,
        readyTimeout: 10_000,
        // Capture the raw host key and compute SHA256 fingerprint
        hostVerifier: (key: Buffer) => {
          const hash = createHash('sha256').update(key).digest('base64');
          fingerprint = `SHA256:${hash}`;
          return true; // Accept all keys — TOFU logic handles verification after
        },
      });
    });

    const fingerprint = result.fingerprint;

    // TOFU logic
    if (host.hostFingerprint) {
      // Already have a stored fingerprint — verify it matches
      if (host.hostFingerprint !== fingerprint) {
        return reply.send({
          success: false,
          message: 'Host fingerprint has changed! This could indicate a security issue.',
          fingerprint,
        });
      }
      return reply.send({
        success: true,
        message: 'Connection successful — fingerprint verified',
        fingerprint,
      });
    }

    // No stored fingerprint yet
    if (body.data.acceptFingerprint) {
      // User accepted — store the fingerprint
      await db
        .update(remoteHosts)
        .set({ hostFingerprint: fingerprint, updatedAt: new Date() })
        .where(eq(remoteHosts.id, id));

      return reply.send({
        success: true,
        message: 'Connection successful — fingerprint accepted and stored',
        fingerprint,
      });
    }

    // First connection — ask user to accept the fingerprint
    return reply.send({
      success: false,
      message: 'New host fingerprint detected. Please verify and accept.',
      fingerprint,
      needsAcceptance: true,
    });
  } catch (error) {
    request.log.error(error);
    return reply.send({
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
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
