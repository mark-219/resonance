import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql, count as countFn, ilike } from 'drizzle-orm';
import { db } from '../db/index.js';
import { artists, albums, tracks } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const listArtistsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(255).optional(),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listArtistsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = listArtistsSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset, search } = query.data;

  const whereClause = search ? ilike(artists.name, `%${search}%`) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select({
        id: artists.id,
        name: artists.name,
        sortName: artists.sortName,
        metadata: artists.metadata,
        createdAt: artists.createdAt,
        albumCount: sql<number>`(
          SELECT COUNT(*) FROM albums WHERE albums.artist_id = ${artists.id}
        )`.as('album_count'),
      })
      .from(artists)
      .where(whereClause)
      .orderBy(artists.sortName)
      .limit(limit)
      .offset(offset),
    db.select({ total: countFn() }).from(artists).where(whereClause),
  ]);

  return reply.send({
    data,
    pagination: {
      limit,
      offset,
      total: Number(countResult[0]?.total ?? 0),
    },
  });
}

async function getArtistHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [artist] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);

  if (!artist) {
    return reply.status(404).send({ error: 'Artist not found' });
  }

  // Get artist's albums
  const artistAlbums = await db
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      formats: albums.formats,
      bestFormat: albums.bestFormat,
      coverArtPath: albums.coverArtPath,
      seedOnly: albums.seedOnly,
    })
    .from(albums)
    .where(eq(albums.artistId, id))
    .orderBy(desc(albums.year));

  return reply.send({
    ...artist,
    albums: artistAlbums,
  });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function artistsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth] }, listArtistsHandler);
  app.get('/:id', { preHandler: [requireAuth] }, getArtistHandler);
}
