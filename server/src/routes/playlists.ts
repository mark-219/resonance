import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { playlists, playlistTracks, tracks } from '../db/schema.js';
import { requireAuth, requireUser } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  isPublic: z.boolean().default(false),
});

const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  isPublic: z.boolean().optional(),
});

const addTrackSchema = z.object({
  trackId: z.string().uuid(),
  position: z.number().int().min(0).optional(),
});

const reorderTracksSchema = z.object({
  tracks: z.array(
    z.object({
      playlistTrackId: z.string().uuid(),
      position: z.number().int().min(0),
    })
  ),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Route handlers ──────────────────────────────────────────────────

async function listPlaylistsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = paginationSchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { limit, offset } = query.data;

  // List playlists created by current user
  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, request.user!.id))
      .orderBy(desc(playlists.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: playlists.id })
      .from(playlists)
      .where(eq(playlists.userId, request.user!.id)),
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

async function getPlaylistHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  // Get playlist tracks
  const playlistTracksData = await db
    .select({
      playlistTrackId: playlistTracks.id,
      position: playlistTracks.position,
      addedAt: playlistTracks.addedAt,
      track: {
        id: tracks.id,
        title: tracks.title,
        duration: tracks.duration,
        format: tracks.format,
        trackNumber: tracks.trackNumber,
        discNumber: tracks.discNumber,
        albumId: tracks.albumId,
      },
    })
    .from(playlistTracks)
    .leftJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, id))
    .orderBy(playlistTracks.position);

  return reply.send({
    ...playlist,
    tracks: playlistTracksData,
  });
}

async function createPlaylistHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createPlaylistSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  const [playlist] = await db
    .insert(playlists)
    .values({
      ...body.data,
      userId: request.user!.id,
    })
    .returning();

  return reply.status(201).send(playlist);
}

async function updatePlaylistHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = updatePlaylistSchema.safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Verify ownership
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  if (playlist.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  const [updated] = await db
    .update(playlists)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(eq(playlists.id, id))
    .returning();

  return reply.send(updated);
}

async function deletePlaylistHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  // Verify ownership
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  if (playlist.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  await db.delete(playlists).where(eq(playlists.id, id));

  return reply.send({ success: true });
}

async function addTrackHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = addTrackSchema.safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Verify ownership
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  if (playlist.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  // Verify track exists
  const [track] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, body.data.trackId))
    .limit(1);

  if (!track) {
    return reply.status(404).send({ error: 'Track not found' });
  }

  // Determine position (default to end of list)
  let position = body.data.position;
  if (position === undefined) {
    const [lastTrack] = await db
      .select({ position: playlistTracks.position })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, id))
      .orderBy(playlistTracks.position)
      .limit(1);

    position = (lastTrack?.position || -1) + 1;
  }

  const [playlistTrack] = await db
    .insert(playlistTracks)
    .values({
      playlistId: id,
      trackId: body.data.trackId,
      position,
    })
    .returning();

  return reply.status(201).send(playlistTrack);
}

async function removeTrackHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id, trackId } = request.params as { id: string; trackId: string };

  // Verify ownership
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  if (playlist.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  const result = await db
    .delete(playlistTracks)
    .where(
      and(eq(playlistTracks.playlistId, id), eq(playlistTracks.trackId, trackId))
    )
    .returning();

  if (result.length === 0) {
    return reply.status(404).send({ error: 'Track not found in playlist' });
  }

  return reply.send({ success: true });
}

async function reorderTracksHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = reorderTracksSchema.safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({ error: 'Invalid request', issues: body.error.issues });
  }

  // Verify ownership
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, id))
    .limit(1);

  if (!playlist) {
    return reply.status(404).send({ error: 'Playlist not found' });
  }

  if (playlist.userId !== request.user!.id) {
    return reply.status(403).send({ error: 'Not authorized' });
  }

  // Update positions
  await Promise.all(
    body.data.tracks.map((item: { playlistTrackId: string; position: number }) =>
      db
        .update(playlistTracks)
        .set({ position: item.position })
        .where(eq(playlistTracks.id, item.playlistTrackId))
        .execute()
    )
  );

  return reply.send({ success: true });
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function playlistsRoutes(app: FastifyInstance) {
  // List user's playlists
  app.get('/', { preHandler: [requireAuth] }, listPlaylistsHandler);

  // Get single playlist with tracks
  app.get('/:id', { preHandler: [requireAuth] }, getPlaylistHandler);

  // Create playlist
  app.post('/', { preHandler: [requireUser] }, createPlaylistHandler);

  // Update playlist
  app.patch('/:id', { preHandler: [requireUser] }, updatePlaylistHandler);

  // Delete playlist
  app.delete('/:id', { preHandler: [requireUser] }, deletePlaylistHandler);

  // Add track to playlist
  app.post('/:id/tracks', { preHandler: [requireUser] }, addTrackHandler);

  // Remove track from playlist
  app.delete('/:id/tracks/:trackId', { preHandler: [requireUser] }, removeTrackHandler);

  // Reorder tracks in playlist
  app.patch('/:id/tracks/reorder', { preHandler: [requireUser] }, reorderTracksHandler);
}
