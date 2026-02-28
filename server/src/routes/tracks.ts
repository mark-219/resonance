import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tracks, albums, artists } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const listTracksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  albumId: z.string().uuid().optional(),
  artistId: z.string().uuid().optional(),
  format: z.string().optional(),
  libraryId: z.string().uuid().optional(),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listTracksHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = listTracksSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset, albumId, artistId, format, libraryId } = query.data;

  // Build where conditions
  const conditions = [];

  if (albumId) {
    conditions.push(eq(tracks.albumId, albumId));
  }

  if (artistId) {
    conditions.push(eq(tracks.artistId, artistId));
  }

  if (format) {
    conditions.push(eq(tracks.format, sql`${format}::"trackFormat"`));
  }

  // Query tracks
  let query_builder = db
    .select({
      id: tracks.id,
      albumId: tracks.albumId,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      duration: tracks.duration,
      format: tracks.format,
      bitrate: tracks.bitrate,
      sampleRate: tracks.sampleRate,
      bitDepth: tracks.bitDepth,
      fileSize: tracks.fileSize,
      createdAt: tracks.createdAt,
    })
    .from(tracks);

  if (conditions.length > 0) {
    query_builder = query_builder.where(and(...conditions)) as any;
  }

  // If libraryId is provided, we need to join with albums to filter by library
  if (libraryId) {
    query_builder = query_builder
      .leftJoin(albums, eq(tracks.albumId, albums.id))
      .where(eq(albums.libraryId, libraryId)) as any;
  }

  // Get total count
  let countQuery = db.select({ count: tracks.id }).from(tracks);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as any;
  }

  const [data, countResult] = await Promise.all([
    query_builder.orderBy(desc(tracks.createdAt)).limit(limit).offset(offset),
    countQuery.execute(),
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

async function getTrackHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [track] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);

  if (!track) {
    return reply.status(404).send({ error: 'Track not found' });
  }

  // Get album info
  let album: any = null;
  if (track.albumId) {
    const [albumData] = await db
      .select({
        id: albums.id,
        title: albums.title,
        year: albums.year,
        artistId: albums.artistId,
        bestFormat: albums.bestFormat,
        seedOnly: albums.seedOnly,
      })
      .from(albums)
      .where(eq(albums.id, track.albumId))
      .limit(1);

    album = albumData;

    // Get album artist
    if (album?.artistId) {
      const [albumArtist] = await db
        .select({
          id: artists.id,
          name: artists.name,
          sortName: artists.sortName,
        })
        .from(artists)
        .where(eq(artists.id, album.artistId))
        .limit(1);

      if (albumArtist) {
        album.artist = albumArtist;
      }
    }
  }

  // Get track artist if different from album artist
  let trackArtist = null;
  if (track.artistId) {
    const [artist] = await db
      .select({
        id: artists.id,
        name: artists.name,
        sortName: artists.sortName,
      })
      .from(artists)
      .where(eq(artists.id, track.artistId))
      .limit(1);

    trackArtist = artist;
  }

  return reply.send({
    ...track,
    album,
    artist: trackArtist,
  });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function tracksRoutes(app: FastifyInstance) {
  // List tracks with filtering
  app.get('/', { preHandler: [requireAuth] }, listTracksHandler);

  // Get single track
  app.get('/:id', { preHandler: [requireAuth] }, getTrackHandler);
}
