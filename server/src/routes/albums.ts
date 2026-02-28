import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albums, tracks, artists } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const listAlbumsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  libraryId: z.string().uuid().optional(),
  artistId: z.string().uuid().optional(),
  format: z.string().optional(),
  seedOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const updateAlbumSchema = z.object({
  seedOnly: z.boolean().optional(),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listAlbumsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = listAlbumsSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset, libraryId, artistId, format, seedOnly } = query.data;

  // Build where conditions
  const conditions = [];

  if (libraryId) {
    conditions.push(eq(albums.libraryId, libraryId));
  }

  if (artistId) {
    conditions.push(eq(albums.artistId, artistId));
  }

  if (seedOnly !== undefined) {
    conditions.push(eq(albums.seedOnly, seedOnly));
  }

  // Filter by format if provided
  let query_builder = db.select().from(albums);

  if (conditions.length > 0) {
    query_builder = query_builder.where(and(...conditions)) as any;
  }

  // Get total count
  let countQuery = db.select({ count: albums.id }).from(albums);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as any;
  }

  const [data, countResult] = await Promise.all([
    query_builder.orderBy(desc(albums.createdAt)).limit(limit).offset(offset),
    countQuery.execute(),
  ]);

  // Filter by format in memory if specified (since JSON array doesn't have direct SQL filter)
  let filtered = data;
  if (format) {
    filtered = data.filter((album) => album.formats?.includes(format));
  }

  return reply.send({
    data: filtered,
    pagination: {
      limit,
      offset,
      total: countResult.length,
    },
  });
}

async function getAlbumHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [album] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);

  if (!album) {
    return reply.status(404).send({ error: 'Album not found' });
  }

  // Get album tracks
  const albumTracks = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      duration: tracks.duration,
      format: tracks.format,
      filePath: tracks.filePath,
      bitrate: tracks.bitrate,
      sampleRate: tracks.sampleRate,
      bitDepth: tracks.bitDepth,
      fileSize: tracks.fileSize,
    })
    .from(tracks)
    .where(eq(tracks.albumId, id))
    .orderBy(tracks.discNumber, tracks.trackNumber);

  // Get artist details if available
  let artist = null;
  if (album.artistId) {
    const [artistData] = await db
      .select({
        id: artists.id,
        name: artists.name,
        sortName: artists.sortName,
        musicBrainzId: artists.musicBrainzId,
      })
      .from(artists)
      .where(eq(artists.id, album.artistId))
      .limit(1);

    artist = artistData;
  }

  return reply.send({
    ...album,
    artist,
    tracks: albumTracks,
  });
}

async function updateAlbumHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = updateAlbumSchema.safeParse(request.body);

  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Only allow non-empty updates
  const updateData = Object.fromEntries(
    Object.entries(body.data).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(updateData).length === 0) {
    return reply.status(400).send({ error: 'No fields to update' });
  }

  const [album] = await db
    .update(albums)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(eq(albums.id, id))
    .returning();

  if (!album) {
    return reply.status(404).send({ error: 'Album not found' });
  }

  return reply.send(album);
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function albumsRoutes(app: FastifyInstance) {
  // List albums with filtering
  app.get('/', { preHandler: [requireAuth] }, listAlbumsHandler);

  // Get single album with tracks
  app.get('/:id', { preHandler: [requireAuth] }, getAlbumHandler);

  // Update album
  app.patch('/:id', { preHandler: [requireAuth] }, updateAlbumHandler);
}
