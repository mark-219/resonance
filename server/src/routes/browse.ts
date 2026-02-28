import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db/index.js';
import { libraries, remoteHosts } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const browseRemoteSchema = z.object({
  hostId: z.string().uuid(),
  path: z.string().default('/'),
});

const browseLocalSchema = z.object({
  path: z.string().default('/'),
});

// ─── Types ────────────────────────────────────────────────────────────

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  format?: string;
}

// ─── Utility functions ────────────────────────────────────────────────

/**
 * Normalize and validate a path to prevent directory traversal attacks
 */
function normalizePath(basePath: string, userPath: string): string {
  const normalized = path.normalize(userPath);

  // Ensure the resolved path is within the base path
  const resolvedPath = path.resolve(basePath, normalized);
  const resolvedBase = path.resolve(basePath);

  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal not allowed');
  }

  return resolvedPath;
}

/**
 * Get file extension and determine audio format
 */
function getAudioFormat(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase().substring(1);

  const formatMap: Record<string, string> = {
    flac: 'FLAC',
    wav: 'WAV',
    aiff: 'AIFF',
    aif: 'AIFF',
    mp3: 'MP3_V0', // Default, actual bitrate would be determined during scan
    m4a: 'AAC_256',
    aac: 'AAC_256',
    ogg: 'OGG',
    opus: 'OPUS',
    ape: 'APE',
    wv: 'WV',
    alac: 'ALAC',
  };

  return formatMap[ext];
}

// ─── Route handlers ──────────────────────────────────────────────────

async function browseRemoteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = browseRemoteSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { hostId, path: userPath } = query.data;

  try {
    // Get remote host details
    const [host] = await db
      .select()
      .from(remoteHosts)
      .where(eq(remoteHosts.id, hostId))
      .limit(1);

    if (!host) {
      return reply.status(404).send({ error: 'Remote host not found' });
    }

    // TODO: Implement SFTP browsing using a library like ssh2-sftp-client
    // This would:
    // 1. Connect to the remote host via SSH
    // 2. List directory contents
    // 3. Get file metadata
    // 4. Return directory listing with proper path traversal protection

    // For now, return a mock response
    const entries: DirectoryEntry[] = [
      {
        name: 'Music',
        path: '/Music',
        isDirectory: true,
        modified: new Date().toISOString(),
      },
      {
        name: 'Playlists',
        path: '/Playlists',
        isDirectory: true,
        modified: new Date().toISOString(),
      },
    ];

    return reply.send(entries);
  } catch (error) {
    if (error instanceof Error && error.message === 'Path traversal not allowed') {
      return reply.status(400).send({ error: 'Invalid path' });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: 'Failed to browse directory',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function browseLocalHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = browseLocalSchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid query parameters', issues: query.error.issues });
  }

  const { path: userPath } = query.data;

  try {
    // Get all local libraries
    const allLibraries = await db.select().from(libraries);

    if (allLibraries.length === 0) {
      return reply.status(400).send({ error: 'No local libraries configured' });
    }

    // Use the first local library as the root
    const localLibrary = allLibraries.find((lib) => lib.localPath);

    if (!localLibrary || !localLibrary.localPath) {
      return reply.status(400).send({ error: 'No local library path configured' });
    }

    // Normalize and validate path
    const resolvedPath = normalizePath(localLibrary.localPath, userPath);

    // List directory contents
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

    const listing: DirectoryEntry[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(resolvedPath, entry.name);
        const relativePath = path.relative(localLibrary.localPath!, fullPath);

        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: relativePath,
            isDirectory: true,
          };
        }

        // Get file stats for files
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: relativePath,
          isDirectory: false,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          format: getAudioFormat(entry.name),
        };
      })
    );

    return reply.send(listing);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Path traversal not allowed') {
        return reply.status(400).send({ error: 'Invalid path' });
      }

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.status(404).send({ error: 'Path not found' });
      }

      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return reply.status(403).send({ error: 'Access denied' });
      }
    }

    request.log.error(error);
    return reply.status(500).send({
      error: 'Failed to browse directory',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function browseRoutes(app: FastifyInstance) {
  // Browse remote hosts via SFTP
  app.get('/remote', { preHandler: [requireAuth] }, browseRemoteHandler);

  // Browse local filesystem
  app.get('/local', { preHandler: [requireAuth] }, browseLocalHandler);
}
