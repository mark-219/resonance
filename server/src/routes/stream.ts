import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { tracks, albums, libraries, remoteHosts } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { isStreamableFormat } from '../utils/streamableFormats.js';
import { sshConnectionManager } from '../services/sshConnectionManager.js';

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

  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);

  if (!track) {
    return reply.status(404).send({ error: 'Track not found' });
  }

  if (!isStreamableFormat(track.format)) {
    return reply.status(415).send({
      error: 'Format not streamable in browser',
      format: track.format,
    });
  }

  const [album] = await db
    .select()
    .from(albums)
    .where(eq(albums.id, track.albumId))
    .limit(1);

  if (!album) {
    return reply.status(404).send({ error: 'Album not found' });
  }

  const contentType = contentTypeMap[track.format] || 'application/octet-stream';

  try {
    if (track.isRemote && album.remoteDirPath) {
      return await streamRemote(request, reply, track, album, contentType);
    } else if (!track.isRemote && album.localDirPath) {
      return await streamLocal(request, reply, track, album, contentType);
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

async function streamLocal(
  request: FastifyRequest,
  reply: FastifyReply,
  track: { filePath: string; format: string },
  album: { localDirPath: string | null },
  contentType: string
): Promise<void> {
  const filePath = path.join(album.localDirPath!, track.filePath);

  const resolved = path.resolve(path.normalize(filePath));
  const resolvedBase = path.resolve(album.localDirPath!);

  if (!resolved.startsWith(resolvedBase)) {
    return reply.status(400).send({ error: 'Invalid file path' });
  }

  await fs.access(resolved);
  const stats = await fs.stat(resolved);
  const fileSize = stats.size;

  reply.header('Content-Type', contentType);

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

    return reply.send(createReadStream(resolved, { start, end }));
  }

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Length', String(fileSize));
  return reply.send(createReadStream(resolved));
}

async function streamRemote(
  request: FastifyRequest,
  reply: FastifyReply,
  track: { filePath: string; format: string; albumId: string },
  album: { remoteDirPath: string | null; libraryId: string },
  contentType: string
): Promise<void> {
  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, album.libraryId))
    .limit(1);

  if (!library?.remoteHostId) {
    return reply.status(400).send({ error: 'No remote host configured for this library' });
  }

  const [host] = await db
    .select()
    .from(remoteHosts)
    .where(eq(remoteHosts.id, library.remoteHostId))
    .limit(1);

  if (!host) {
    return reply.status(404).send({ error: 'Remote host not found' });
  }

  const sftp = await sshConnectionManager.getSftp({
    id: host.id,
    host: host.host,
    port: host.port,
    username: host.username,
    privateKeyPath: host.privateKeyPath,
  });

  const remotePath = path.posix.join(album.remoteDirPath!, track.filePath);

  const stats = await new Promise<{ size: number }>((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });

  const fileSize = stats.size;
  reply.header('Content-Type', contentType);

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

    return reply.send(sftp.createReadStream(remotePath, { start, end }));
  }

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Length', String(fileSize));
  return reply.send(sftp.createReadStream(remotePath));
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function streamRoutes(app: FastifyInstance) {
  app.get('/:trackId', { preHandler: [requireAuth] }, streamTrackHandler);
}
