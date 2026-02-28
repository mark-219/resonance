import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { tracks, albums } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Content Type Mapping ──────────────────────────────────────────

const contentTypeMap: Record<string, string> = {
  FLAC_24: 'audio/flac',
  FLAC: 'audio/flac',
  ALAC: 'audio/x-m4a',
  WAV: 'audio/wav',
  AIFF: 'audio/aiff',
  APE: 'audio/ape',
  WV: 'audio/x-wavpack',
  MP3_V0: 'audio/mpeg',
  MP3_320: 'audio/mpeg',
  MP3_V2: 'audio/mpeg',
  MP3_256: 'audio/mpeg',
  MP3_192: 'audio/mpeg',
  MP3_128: 'audio/mpeg',
  AAC_256: 'audio/aac',
  AAC_128: 'audio/aac',
  OGG: 'audio/ogg',
  OPUS: 'audio/opus',
  UNKNOWN: 'application/octet-stream',
};

// ─── Route handlers ──────────────────────────────────────────────────

async function streamTrackHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { trackId } = request.params as { trackId: string };

  // Get track details
  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);

  if (!track) {
    return reply.status(404).send({ error: 'Track not found' });
  }

  // Get album for library info
  const [album] = await db
    .select()
    .from(albums)
    .where(eq(albums.id, track.albumId))
    .limit(1);

  if (!album) {
    return reply.status(404).send({ error: 'Album not found' });
  }

  try {
    // Determine the file path
    let filePath: string;

    if (track.isRemote && album.remoteDirPath) {
      // TODO: For remote files via SFTP, implement streaming from remote server
      // This would require:
      // 1. Connect to the remote SSH host
      // 2. Open the file via SFTP
      // 3. Stream it back to the client
      // For now, throw an error indicating remote streaming is not implemented
      return reply.status(501).send({
        error: 'Remote streaming not yet implemented',
        details: 'SFTP streaming requires additional setup',
      });
    } else if (!track.isRemote && album.localDirPath) {
      // Local file streaming
      filePath = path.join(album.localDirPath, track.filePath);

      // Validate path to prevent traversal
      const normalized = path.normalize(filePath);
      const resolved = path.resolve(normalized);
      const resolvedBase = path.resolve(album.localDirPath);

      if (!resolved.startsWith(resolvedBase)) {
        return reply.status(400).send({ error: 'Invalid file path' });
      }

      // Check if file exists
      await fs.access(resolved);

      // Get file stats
      const stats = await fs.stat(resolved);
      const fileSize = stats.size;

      // Set content type based on audio format
      const contentType = contentTypeMap[track.format] || 'application/octet-stream';
      reply.header('Content-Type', contentType);

      // Handle range requests for seeking
      const range = request.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          reply.header('Content-Range', `bytes */${fileSize}`);
          return reply.status(416).send();
        }

        reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Length', String(end - start + 1));
        reply.status(206);

        const stream = createReadStream(resolved, { start, end });
        return reply.send(stream);
      }

      // Regular response
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', String(fileSize));

      const stream = createReadStream(resolved);
      return reply.send(stream);
    } else {
      return reply.status(400).send({ error: 'File path not available' });
    }
  } catch (error) {
    request.log.error(error);

    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.status(404).send({ error: 'File not found' });
      }

      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return reply.status(403).send({ error: 'Access denied' });
      }
    }

    return reply.status(500).send({
      error: 'Failed to stream track',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function streamRoutes(app: FastifyInstance) {
  // Stream audio file
  app.get('/:trackId', { preHandler: [requireAuth] }, streamTrackHandler);
}
