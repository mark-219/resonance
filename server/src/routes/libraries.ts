import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { libraries, scanJobs } from '../db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { enqueueScan } from '../services/scanQueue.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const createLibrarySchema = z.object({
  name: z.string().min(1).max(255),
  remoteHostId: z.string().uuid().optional(),
  remotePath: z.string().max(1024).optional(),
  localPath: z.string().max(1024).optional(),
});

const updateLibrarySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  remotePath: z.string().max(1024).optional(),
  localPath: z.string().max(1024).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listLibrariesHandler(
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
      .select()
      .from(libraries)
      .orderBy(desc(libraries.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: libraries.id }).from(libraries),
  ]);

  return reply.send({
    data,
    pagination: {
      limit,
      offset,
      total: count.length,
    },
  });
}

async function getLibraryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (!library) {
    return reply.status(404).send({ error: 'Library not found' });
  }

  return reply.send(library);
}

async function createLibraryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createLibrarySchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Either remoteHostId + remotePath or localPath must be provided
  if (!body.data.remoteHostId && !body.data.localPath) {
    return reply.status(400).send({
      error: 'Either remoteHostId with remotePath or localPath must be provided',
    });
  }

  const [library] = await db
    .insert(libraries)
    .values({
      ...body.data,
      createdBy: request.user?.id,
    })
    .returning();

  return reply.status(201).send(library);
}

async function updateLibraryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = updateLibrarySchema.safeParse(request.body);

  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [library] = await db
    .update(libraries)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(eq(libraries.id, id))
    .returning();

  if (!library) {
    return reply.status(404).send({ error: 'Library not found' });
  }

  return reply.send(library);
}

async function deleteLibraryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const result = await db.delete(libraries).where(eq(libraries.id, id)).returning();

  if (result.length === 0) {
    return reply.status(404).send({ error: 'Library not found' });
  }

  return reply.send({ success: true });
}

async function scanLibraryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (!library) {
    return reply.status(404).send({ error: 'Library not found' });
  }

  // Determine the scan path
  const libraryPath = library.localPath || library.remotePath;
  if (!libraryPath) {
    return reply.status(400).send({
      error: 'Library has no configured path (localPath or remotePath)',
    });
  }

  // Create a new scan job
  const [scanJob] = await db
    .insert(scanJobs)
    .values({
      libraryId: id,
      status: 'pending',
      createdBy: request.user?.id,
    })
    .returning();

  // Enqueue the scan job for async processing
  await enqueueScan({
    jobId: scanJob.id,
    libraryId: id,
    userId: request.user!.id,
    libraryPath,
    isRemote: !!library.remoteHostId,
  });

  return reply.status(201).send({
    jobId: scanJob.id,
    status: scanJob.status,
    message: 'Scan job created and queued',
  });
}

async function listScanJobsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const query = paginationSchema.safeParse(request.query);

  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset } = query.data;

  // Verify library exists
  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (!library) {
    return reply.status(404).send({ error: 'Library not found' });
  }

  const [data, count] = await Promise.all([
    db
      .select()
      .from(scanJobs)
      .where(eq(scanJobs.libraryId, id))
      .orderBy(desc(scanJobs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: scanJobs.id }).from(scanJobs).where(eq(scanJobs.libraryId, id)),
  ]);

  return reply.send({
    data,
    pagination: {
      limit,
      offset,
      total: count.length,
    },
  });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function librariesRoutes(app: FastifyInstance) {
  // List all libraries
  app.get('/', { preHandler: [requireAuth] }, listLibrariesHandler);

  // Get single library
  app.get('/:id', { preHandler: [requireAuth] }, getLibraryHandler);

  // Create library
  app.post('/', { preHandler: [requireAdmin] }, createLibraryHandler);

  // Update library
  app.patch('/:id', { preHandler: [requireAdmin] }, updateLibraryHandler);

  // Delete library
  app.delete('/:id', { preHandler: [requireAdmin] }, deleteLibraryHandler);

  // Trigger scan
  app.post('/:id/scan', { preHandler: [requireAdmin] }, scanLibraryHandler);

  // List scan jobs for library
  app.get('/:id/jobs', { preHandler: [requireAuth] }, listScanJobsHandler);
}
