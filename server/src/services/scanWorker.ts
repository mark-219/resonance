/**
 * Library scan worker.
 *
 * Processes scan jobs: walks the library directory, extracts metadata
 * from every audio file, and upserts artists/albums/tracks into the DB.
 *
 * Emits SSE progress events so the UI can show real-time scan status.
 */

import path from 'path';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { libraries, artists, albums, tracks, scanJobs } from '../db/schema.js';
import {
  walkLocalLibrary,
  walkRemoteLibrary,
  readFileBuffer,
  readRemoteFileBuffer,
  countAudioFiles,
  type DiscoveredAlbumDir,
} from './directoryWalker.js';
import { extractMetadata, inferFromPath } from './metadataExtractor.js';
import { getBestFormat, type AudioFormat } from './formatDetector.js';
import {
  emitScanProgress,
  emitScanComplete,
  emitNotification,
} from '../routes/events.js';
import { sshConnectionManager } from './sshConnectionManager.js';
import { remoteHosts } from '../db/schema.js';

// ─── Types ────────────────────────────────────────────────────────────

interface ScanContext {
  jobId: string;
  libraryId: string;
  userId: string;
  libraryPath: string;
  isRemote: boolean;
  remoteHostId?: string;
}

// ─── Artist cache (per scan) ─────────────────────────────────────────

// Avoid repeated DB lookups for the same artist within one scan
const artistCache = new Map<string, string>(); // name → id

async function findOrCreateArtist(name: string): Promise<string> {
  const normalizedName = name.trim();
  const cached = artistCache.get(normalizedName.toLowerCase());
  if (cached) return cached;

  // Try to find existing
  const [existing] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.name, normalizedName))
    .limit(1);

  if (existing) {
    artistCache.set(normalizedName.toLowerCase(), existing.id);
    return existing.id;
  }

  // Create new
  const [created] = await db
    .insert(artists)
    .values({
      name: normalizedName,
      sortName: buildSortName(normalizedName),
    })
    .returning({ id: artists.id });

  artistCache.set(normalizedName.toLowerCase(), created.id);
  return created.id;
}

function buildSortName(name: string): string {
  // "The Beatles" → "Beatles, The"
  const theMatch = name.match(/^(the|a|an)\s+(.+)$/i);
  if (theMatch) {
    return `${theMatch[2]}, ${theMatch[1]}`;
  }
  return name;
}

// ─── Album upsert ────────────────────────────────────────────────────

async function findOrCreateAlbum(opts: {
  libraryId: string;
  artistId: string | undefined;
  title: string;
  year: number | undefined;
  dirPath: string;
  isRemote: boolean;
  coverArtPath: string | undefined;
}): Promise<string> {
  const dirColumn = opts.isRemote ? 'remoteDirPath' : 'localDirPath';

  // Match by directory path within the same library — this is the most reliable key
  const dirField = opts.isRemote ? albums.remoteDirPath : albums.localDirPath;

  const [existing] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.libraryId, opts.libraryId), eq(dirField, opts.dirPath)))
    .limit(1);

  if (existing) return existing.id;

  const values: Record<string, unknown> = {
    libraryId: opts.libraryId,
    artistId: opts.artistId,
    title: opts.title,
    year: opts.year,
    coverArtPath: opts.coverArtPath,
    formats: [],
    seedOnly: opts.isRemote,
  };

  if (opts.isRemote) {
    values.remoteDirPath = opts.dirPath;
  } else {
    values.localDirPath = opts.dirPath;
  }

  const [created] = await db
    .insert(albums)
    .values(values as typeof albums.$inferInsert)
    .returning({ id: albums.id });

  return created.id;
}

// ─── Main scan logic ─────────────────────────────────────────────────

export async function runScan(ctx: ScanContext): Promise<void> {
  const { jobId, libraryId, userId, libraryPath, isRemote } = ctx;

  // Mark job as running
  await db.update(scanJobs).set({ status: 'running' }).where(eq(scanJobs.id, jobId));

  // Fetch library name for user-facing messages (avoid exposing filesystem paths)
  const [library] = await db
    .select({ name: libraries.name })
    .from(libraries)
    .where(eq(libraries.id, libraryId))
    .limit(1);
  const libraryName = library?.name ?? 'library';

  emitNotification(userId, 'Scan started', `Scanning library: ${libraryName}`, 'info');

  try {
    // Resolve readFile function and album dirs based on local vs remote
    let albumDirs: DiscoveredAlbumDir[];
    let readFile: (filePath: string) => Promise<Buffer>;

    if (isRemote && ctx.remoteHostId) {
      // Fetch remote host config from DB
      const [host] = await db
        .select({
          id: remoteHosts.id,
          host: remoteHosts.host,
          port: remoteHosts.port,
          username: remoteHosts.username,
          privateKeyPath: remoteHosts.privateKeyPath,
        })
        .from(remoteHosts)
        .where(eq(remoteHosts.id, ctx.remoteHostId))
        .limit(1);

      if (!host) {
        throw new Error(`Remote host ${ctx.remoteHostId} not found`);
      }

      const sftp = await sshConnectionManager.getSftp(host);

      // Phase 1: Discover directories via SFTP
      albumDirs = await walkRemoteLibrary(sftp, libraryPath, (dir) => {
        emitScanProgress(
          userId,
          jobId,
          libraryId,
          0,
          0,
          `Discovering: ${path.basename(dir)}`
        );
      });

      readFile = (filePath: string) => readRemoteFileBuffer(sftp, filePath);
    } else {
      // Phase 1: Discover directories locally
      albumDirs = await walkLocalLibrary(libraryPath, (dir) => {
        emitScanProgress(
          userId,
          jobId,
          libraryId,
          0,
          0,
          `Discovering: ${path.basename(dir)}`
        );
      });

      readFile = readFileBuffer;
    }

    const totalFiles = countAudioFiles(albumDirs);

    await db
      .update(scanJobs)
      .set({ totalItems: totalFiles })
      .where(eq(scanJobs.id, jobId));

    emitScanProgress(
      userId,
      jobId,
      libraryId,
      0,
      totalFiles,
      'Starting metadata extraction...'
    );

    // Phase 2: Process each album directory
    let processedFiles = 0;

    for (const albumDir of albumDirs) {
      await processAlbumDir(albumDir, ctx, totalFiles, readFile, () => {
        processedFiles++;

        // Emit progress every 5 files (avoid flooding SSE)
        if (processedFiles % 5 === 0 || processedFiles === totalFiles) {
          emitScanProgress(
            userId,
            jobId,
            libraryId,
            processedFiles,
            totalFiles,
            albumDir.relativeDirPath
          );

          // Also update DB progress periodically (every 20 files)
          if (processedFiles % 20 === 0) {
            db.update(scanJobs)
              .set({ progress: processedFiles })
              .where(eq(scanJobs.id, jobId))
              .then(() => {});
          }
        }
      });
    }

    // Mark complete
    await db
      .update(scanJobs)
      .set({
        status: 'completed',
        progress: totalFiles,
        completedAt: new Date(),
      })
      .where(eq(scanJobs.id, jobId));

    // Update library lastScannedAt
    await db
      .update(libraries)
      .set({ lastScannedAt: new Date(), updatedAt: new Date() })
      .where(eq(libraries.id, libraryId));

    emitScanComplete(userId, jobId, libraryId, processedFiles);
    emitNotification(
      userId,
      'Scan complete',
      `Scanned ${processedFiles} tracks in ${albumDirs.length} albums`,
      'success'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(scanJobs)
      .set({
        status: 'failed',
        logOutput: message,
        completedAt: new Date(),
      })
      .where(eq(scanJobs.id, jobId));

    emitNotification(userId, 'Scan failed', message, 'error');
    throw error;
  } finally {
    // Clear per-scan caches
    artistCache.clear();
  }
}

// ─── Process a single album directory ────────────────────────────────

async function processAlbumDir(
  albumDir: DiscoveredAlbumDir,
  ctx: ScanContext,
  _totalFiles: number,
  readFile: (filePath: string) => Promise<Buffer>,
  onFileProcessed: () => void
): Promise<void> {
  const { libraryId, isRemote } = ctx;

  // We'll collect metadata from the first file to populate album-level info,
  // then fill in the rest of the tracks
  let albumId: string | undefined;
  let albumArtistId: string | undefined;
  const albumFormats: AudioFormat[] = [];

  for (const file of albumDir.audioFiles) {
    try {
      const buffer = await readFile(file.absolutePath);
      const meta = await extractMetadata(buffer);

      // Determine artist name: prefer albumArtist tag, fall back to artist tag,
      // then infer from path
      const pathInfo = inferFromPath(file.relativePath);
      const artistName = meta.albumArtist || meta.artist || pathInfo.artist;
      const albumTitle = meta.album || pathInfo.album || albumDir.relativeDirPath;
      const year = meta.year || pathInfo.year;

      // Ensure artist exists
      const artistId = artistName ? await findOrCreateArtist(artistName) : undefined;

      // Track-level artist (may differ from album artist for compilations)
      const trackArtistName = meta.artist || artistName;
      const trackArtistId = trackArtistName
        ? await findOrCreateArtist(trackArtistName)
        : undefined;

      // Ensure album exists (only once per directory)
      if (!albumId) {
        albumArtistId = artistId;
        albumId = await findOrCreateAlbum({
          libraryId,
          artistId,
          title: albumTitle,
          year,
          dirPath: albumDir.dirPath,
          isRemote,
          coverArtPath: albumDir.coverArtPath,
        });
      }

      // Upsert track (keyed by filePath to allow re-scans)
      const [existing] = await db
        .select({ id: tracks.id })
        .from(tracks)
        .where(eq(tracks.filePath, file.absolutePath))
        .limit(1);

      if (existing) {
        // Update existing track
        await db
          .update(tracks)
          .set({
            title: meta.title || file.filename,
            trackNumber: meta.trackNumber,
            discNumber: meta.discNumber,
            duration: meta.duration,
            format: meta.format,
            bitrate: meta.bitrate,
            sampleRate: meta.sampleRate,
            bitDepth: meta.bitDepth,
            fileSize: file.size,
            artistId: trackArtistId,
            metadata: {
              codec: meta.codec,
              bitrateMode: meta.bitrateMode,
              lossless: meta.lossless,
            },
          })
          .where(eq(tracks.id, existing.id));
      } else {
        // Insert new track
        await db.insert(tracks).values({
          albumId: albumId!,
          artistId: trackArtistId,
          title: meta.title || file.filename,
          trackNumber: meta.trackNumber,
          discNumber: meta.discNumber,
          duration: meta.duration,
          filePath: file.absolutePath,
          format: meta.format,
          bitrate: meta.bitrate,
          sampleRate: meta.sampleRate,
          bitDepth: meta.bitDepth,
          fileSize: file.size,
          isRemote,
          metadata: {
            codec: meta.codec,
            bitrateMode: meta.bitrateMode,
            lossless: meta.lossless,
          },
        });
      }

      albumFormats.push(meta.format);
    } catch (err) {
      // Log but don't fail the whole scan for one bad file
      console.error(`Failed to process ${file.absolutePath}:`, err);
    }

    onFileProcessed();
  }

  // Update album with discovered formats
  if (albumId && albumFormats.length > 0) {
    const uniqueFormats = [...new Set(albumFormats)];
    const bestFormat = getBestFormat(albumFormats);

    // Also update album metadata from the first track's genre/label info
    await db
      .update(albums)
      .set({
        formats: uniqueFormats,
        bestFormat,
        updatedAt: new Date(),
      })
      .where(eq(albums.id, albumId));
  }
}
