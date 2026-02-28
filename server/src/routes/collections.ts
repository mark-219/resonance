import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { collections, collectionItems, albums, tracks } from '../db/schema.js';
import { requireAuth, requireUser } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['albums', 'tracks', 'mixed']).default('mixed'),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.enum(['albums', 'tracks', 'mixed']).optional(),
});

const addItemSchema = z.object({
  albumId: z.string().uuid().optional(),
  trackId: z.string().uuid().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listCollectionsHandler(
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

  // List collections created by current user
  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(collections)
      .where(eq(collections.userId, request.user!.id))
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: collections.id })
      .from(collections)
      .where(eq(collections.userId, request.user!.id)),
  ]);

  return reply.send({
    data,
    pagination: {
      limit,
      offset,
      total: countResult.length,
    },
  });
}

async function getCollectionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  if (!collection) {
    return reply.status(404).send({ error: 'Collection not found' });
  }

  // Get collection items
  const items = await db
    .select({
      itemId: collectionItems.id,
      albumId: collectionItems.albumId,
      trackId: collectionItems.trackId,
      addedAt: collectionItems.addedAt,
      album: {
        id: albums.id,
        title: albums.title,
        year: albums.year,
        bestFormat: albums.bestFormat,
      },
      track: {
        id: tracks.id,
        title: tracks.title,
        duration: tracks.duration,
        trackNumber: tracks.trackNumber,
        albumId: tracks.albumId,
      },
    })
    .from(collectionItems)
    .leftJoin(albums, eq(collectionItems.albumId, albums.id))
    .leftJoin(tracks, eq(collectionItems.trackId, tracks.id))
    .where(eq(collectionItems.collectionId, id));

  return reply.send({
    ...collection,
    items,
  });
}

async function createCollectionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createCollectionSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [collection] = await db
    .insert(collections)
    .values({
      ...body.data,
      userId: request.user!.id,
    })
    .returning();

  return reply.status(201).send(collection);
}

async function updateCollectionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = updateCollectionSchema.safeParse(request.body);

  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Verify ownership
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  if (!collection) {
    return reply.status(404).send({ error: 'Collection not found' });
  }

  if (collection.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  const [updated] = await db
    .update(collections)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(eq(collections.id, id))
    .returning();

  return reply.send(updated);
}

async function deleteCollectionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  // Verify ownership
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  if (!collection) {
    return reply.status(404).send({ error: 'Collection not found' });
  }

  if (collection.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  await db.delete(collections).where(eq(collections.id, id));

  return reply.send({ success: true });
}

async function addItemHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = addItemSchema.safeParse(request.body);

  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Either albumId or trackId must be provided
  if (!body.data.albumId && !body.data.trackId) {
    return reply
      .status(400)
      .send({ error: 'Either albumId or trackId must be provided' });
  }

  // Verify ownership
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  if (!collection) {
    return reply.status(404).send({ error: 'Collection not found' });
  }

  if (collection.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  // Verify item exists (album or track)
  if (body.data.albumId) {
    const [album] = await db
      .select()
      .from(albums)
      .where(eq(albums.id, body.data.albumId))
      .limit(1);

    if (!album) {
      return reply.status(404).send({ error: 'Album not found' });
    }
  }

  if (body.data.trackId) {
    const [track] = await db
      .select()
      .from(tracks)
      .where(eq(tracks.id, body.data.trackId))
      .limit(1);

    if (!track) {
      return reply.status(404).send({ error: 'Track not found' });
    }
  }

  const [item] = await db
    .insert(collectionItems)
    .values({
      collectionId: id,
      albumId: body.data.albumId,
      trackId: body.data.trackId,
    })
    .returning();

  return reply.status(201).send(item);
}

async function removeItemHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id, itemId } = request.params as { id: string; itemId: string };

  // Verify ownership
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  if (!collection) {
    return reply.status(404).send({ error: 'Collection not found' });
  }

  if (collection.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  const result = await db
    .delete(collectionItems)
    .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.id, itemId)))
    .returning();

  if (result.length === 0) {
    return reply.status(404).send({ error: 'Item not found in collection' });
  }

  return reply.send({ success: true });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function collectionsRoutes(app: FastifyInstance) {
  // List user's collections
  app.get('/', { preHandler: [requireAuth] }, listCollectionsHandler);

  // Get single collection with items
  app.get('/:id', { preHandler: [requireAuth] }, getCollectionHandler);

  // Create collection
  app.post('/', { preHandler: [requireUser] }, createCollectionHandler);

  // Update collection
  app.patch('/:id', { preHandler: [requireUser] }, updateCollectionHandler);

  // Delete collection
  app.delete('/:id', { preHandler: [requireUser] }, deleteCollectionHandler);

  // Add item to collection
  app.post('/:id/items', { preHandler: [requireUser] }, addItemHandler);

  // Remove item from collection
  app.delete('/:id/items/:itemId', { preHandler: [requireUser] }, removeItemHandler);
}
