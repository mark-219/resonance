/**
 * Directory walker for local filesystem.
 *
 * Recursively walks a library path and yields audio files
 * grouped by their parent directory (album folder).
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import path from 'node:path';
import type { SFTPWrapper } from 'ssh2';
import { isAudioFile, isCoverArt } from './formatDetector.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string; // relative to library root
  filename: string;
  size: number;
}

export interface DiscoveredAlbumDir {
  dirPath: string; // absolute
  relativeDirPath: string; // relative to library root
  audioFiles: DiscoveredFile[];
  coverArtPath: string | undefined; // absolute path to cover art
}

// ─── Walker ──────────────────────────────────────────────────────────

/**
 * Walk a library root directory and discover album folders.
 *
 * An "album folder" is any directory that directly contains audio files.
 * This handles both:
 *   Artist/Album/tracks.flac
 *   Artist/Album/Disc 1/tracks.flac
 *
 * The onProgress callback fires per directory visited.
 */
export async function walkLocalLibrary(
  rootPath: string,
  onProgress?: (dir: string) => void
): Promise<DiscoveredAlbumDir[]> {
  const albumDirs: DiscoveredAlbumDir[] = [];

  async function walk(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      // Skip unreadable directories (permission denied, etc.)
      return;
    }

    if (onProgress) {
      onProgress(relative(rootPath, dirPath) || '.');
    }

    const audioFiles: DiscoveredFile[] = [];
    let coverArtPath: string | undefined;
    const subdirs: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        subdirs.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (isAudioFile(entry.name)) {
          try {
            const fileStat = await stat(fullPath);
            audioFiles.push({
              absolutePath: fullPath,
              relativePath: relative(rootPath, fullPath),
              filename: entry.name,
              size: fileStat.size,
            });
          } catch {
            // Skip unreadable files
          }
        } else if (!coverArtPath && isCoverArt(entry.name)) {
          coverArtPath = fullPath;
        }
      }
    }

    // If this directory has audio files, it's an album directory
    if (audioFiles.length > 0) {
      albumDirs.push({
        dirPath,
        relativeDirPath: relative(rootPath, dirPath),
        audioFiles,
        coverArtPath,
      });
    }

    // Recurse into subdirectories
    for (const subdir of subdirs) {
      await walk(subdir);
    }
  }

  await walk(rootPath);
  return albumDirs;
}

/**
 * Read a file into a Buffer. Used to feed audio files to the metadata extractor.
 */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/**
 * Count total audio files across discovered album dirs.
 */
export function countAudioFiles(albumDirs: DiscoveredAlbumDir[]): number {
  return albumDirs.reduce((sum, dir) => sum + dir.audioFiles.length, 0);
}

// ─── SFTP Walker ────────────────────────────────────────────────────

/**
 * Walk a remote library directory via SFTP and discover album folders.
 *
 * Same semantics as walkLocalLibrary but uses SFTP readdir/stat.
 * Remote paths are always POSIX.
 */
export async function walkRemoteLibrary(
  sftp: SFTPWrapper,
  rootPath: string,
  onProgress?: (dir: string) => void
): Promise<DiscoveredAlbumDir[]> {
  const albumDirs: DiscoveredAlbumDir[] = [];
  const posix = path.posix;

  async function sftpReaddir(dirPath: string) {
    return new Promise<import('ssh2').FileEntryWithStats[]>((resolve, reject) => {
      sftp.readdir(dirPath, (err, list) => {
        if (err) return reject(err);
        resolve(list);
      });
    });
  }

  async function walk(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await sftpReaddir(dirPath);
    } catch {
      // Skip unreadable directories (permission denied, etc.)
      return;
    }

    if (onProgress) {
      onProgress(posix.relative(rootPath, dirPath) || '.');
    }

    const audioFiles: DiscoveredFile[] = [];
    let coverArtPath: string | undefined;
    const subdirs: string[] = [];

    for (const entry of entries) {
      const fullPath = posix.join(dirPath, entry.filename);

      if (entry.attrs.isDirectory()) {
        subdirs.push(fullPath);
        continue;
      }

      if (entry.attrs.isFile()) {
        if (isAudioFile(entry.filename)) {
          audioFiles.push({
            absolutePath: fullPath,
            relativePath: posix.relative(rootPath, fullPath),
            filename: entry.filename,
            size: entry.attrs.size,
          });
        } else if (!coverArtPath && isCoverArt(entry.filename)) {
          coverArtPath = fullPath;
        }
      }
    }

    if (audioFiles.length > 0) {
      albumDirs.push({
        dirPath,
        relativeDirPath: posix.relative(rootPath, dirPath),
        audioFiles,
        coverArtPath,
      });
    }

    for (const subdir of subdirs) {
      await walk(subdir);
    }
  }

  await walk(rootPath);
  return albumDirs;
}

/**
 * Read a remote file into a Buffer via SFTP.
 */
export async function readRemoteFileBuffer(
  sftp: SFTPWrapper,
  filePath: string
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    sftp.readFile(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}
