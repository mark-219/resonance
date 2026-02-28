/**
 * Audio metadata extraction using music-metadata.
 *
 * Parses audio files (from streams or buffers) and returns
 * normalized metadata: tags, format info, and duration.
 */

import { parseBuffer, type IAudioMetadata } from 'music-metadata';
import { detectFormat, type AudioFormat } from './formatDetector.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface TrackMetadata {
  title: string | undefined;
  artist: string | undefined;
  albumArtist: string | undefined;
  album: string | undefined;
  year: number | undefined;
  trackNumber: number | undefined;
  discNumber: number | undefined;
  genre: string[];
  duration: number | undefined; // seconds (integer)
  format: AudioFormat;
  bitrate: number | undefined; // bps
  sampleRate: number | undefined; // Hz
  bitDepth: number | undefined;
  codec: string | undefined;
  bitrateMode: string | undefined;
  lossless: boolean;
  label: string | undefined;
  catalogNumber: string | undefined;
  musicBrainzArtistId: string | undefined;
  musicBrainzAlbumId: string | undefined;
  hasCoverArt: boolean;
}

// ─── Extraction ──────────────────────────────────────────────────────

export async function extractMetadata(
  buffer: Buffer,
  mimeType?: string
): Promise<TrackMetadata> {
  const metadata: IAudioMetadata = await parseBuffer(buffer, { mimeType });

  const { common, format } = metadata;

  const codec = format.codec ?? 'unknown';
  const container = format.container ?? 'unknown';
  const lossless = format.lossless ?? false;
  const bitrate = format.bitrate ?? 0;
  const sampleRate = format.sampleRate ?? 44100;
  const bitDepth = format.bitsPerSample;
  const bitrateMode = format.codecProfile;

  const audioFormat = detectFormat({
    codec,
    container,
    lossless,
    bitrate,
    sampleRate,
    bitDepth,
    bitrateMode,
  });

  return {
    title: common.title ?? undefined,
    artist: common.artist ?? undefined,
    albumArtist: common.albumartist ?? undefined,
    album: common.album ?? undefined,
    year: common.year ?? undefined,
    trackNumber: common.track?.no ?? undefined,
    discNumber: common.disk?.no ?? undefined,
    genre: common.genre ?? [],
    duration: format.duration ? Math.round(format.duration) : undefined,
    format: audioFormat,
    bitrate: bitrate ? Math.round(bitrate) : undefined,
    sampleRate: sampleRate ?? undefined,
    bitDepth: bitDepth ?? undefined,
    codec,
    bitrateMode: bitrateMode ?? undefined,
    lossless,
    label: common.label?.[0] ?? undefined,
    catalogNumber: common.catalognumber?.[0] ?? undefined,
    musicBrainzArtistId: common.musicbrainz_artistid?.[0] ?? undefined,
    musicBrainzAlbumId: common.musicbrainz_albumid?.[0] ?? undefined,
    hasCoverArt: (common.picture?.length ?? 0) > 0,
  };
}

/**
 * Infer artist/album from a file path when tags are missing.
 * Expects: .../Artist Name/Album Name/01 - Track.flac
 * or:      .../Artist Name/Album Name (Year)/01 - Track.flac
 */
export function inferFromPath(filePath: string): {
  artist: string | undefined;
  album: string | undefined;
  year: number | undefined;
} {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

  if (parts.length < 3) {
    return { artist: undefined, album: undefined, year: undefined };
  }

  // Last part is the filename, second-to-last is album, third-to-last is artist
  const albumPart = parts[parts.length - 2];
  const artistPart = parts[parts.length - 3];

  // Try to extract year from album folder name: "Album Name (2024)" or "Album Name [2024]"
  const yearMatch = albumPart.match(/[\(\[]\s*((?:19|20)\d{2})\s*[\)\]]/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // Clean album name by removing year suffix
  const album = albumPart.replace(/\s*[\(\[](?:19|20)\d{2}[\)\]]\s*$/, '').trim();

  return {
    artist: artistPart || undefined,
    album: album || undefined,
    year,
  };
}
