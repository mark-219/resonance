/**
 * Audio format detection and quality ranking.
 *
 * Maps raw metadata from music-metadata into our audioFormatEnum
 * and assigns a quality score (0–100) for sorting and display.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface AudioInfo {
  codec: string;
  container: string;
  lossless: boolean;
  bitrate: number; // bps
  sampleRate: number; // Hz
  bitDepth: number | undefined;
  bitrateMode?: string; // 'CBR' | 'VBR'
}

export type AudioFormat =
  | 'FLAC_24'
  | 'FLAC'
  | 'ALAC'
  | 'WAV'
  | 'AIFF'
  | 'APE'
  | 'WV'
  | 'MP3_V0'
  | 'MP3_320'
  | 'MP3_V2'
  | 'MP3_256'
  | 'MP3_192'
  | 'MP3_128'
  | 'AAC_256'
  | 'AAC_128'
  | 'OGG'
  | 'OPUS'
  | 'UNKNOWN';

// ─── Quality scores (0–100) ──────────────────────────────────────────

const QUALITY_SCORES: Record<AudioFormat, number> = {
  FLAC_24: 100,
  WAV: 98,
  AIFF: 97,
  FLAC: 95,
  ALAC: 94,
  APE: 93,
  WV: 92,
  MP3_V0: 80,
  MP3_320: 78,
  OPUS: 75,
  OGG: 72,
  AAC_256: 70,
  MP3_V2: 65,
  MP3_256: 63,
  MP3_192: 55,
  AAC_128: 50,
  MP3_128: 30,
  UNKNOWN: 0,
};

// ─── Format labels for display ───────────────────────────────────────

const FORMAT_LABELS: Record<AudioFormat, string> = {
  FLAC_24: 'FLAC 24-bit',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
  APE: 'APE',
  WV: 'WavPack',
  MP3_V0: 'MP3 V0',
  MP3_320: 'MP3 320',
  MP3_V2: 'MP3 V2',
  MP3_256: 'MP3 256',
  MP3_192: 'MP3 192',
  MP3_128: 'MP3 128',
  AAC_256: 'AAC 256',
  AAC_128: 'AAC 128',
  OGG: 'Ogg Vorbis',
  OPUS: 'Opus',
  UNKNOWN: 'Unknown',
};

// ─── Quality tiers ───────────────────────────────────────────────────

export type QualityTier = 'lossless' | 'high' | 'mid' | 'low';

function getTier(score: number): QualityTier {
  if (score >= 90) return 'lossless';
  if (score >= 65) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

// ─── Detection logic ─────────────────────────────────────────────────

export function detectFormat(info: AudioInfo): AudioFormat {
  const { codec, lossless, bitrate, bitDepth, bitrateMode } = info;
  const codecLower = codec.toLowerCase();
  const kbps = Math.round(bitrate / 1000);

  // Lossless formats
  if (lossless || codecLower.includes('flac')) {
    if (bitDepth && bitDepth > 16) return 'FLAC_24';
    return 'FLAC';
  }

  if (codecLower.includes('alac') || codecLower.includes('apple lossless')) {
    return 'ALAC';
  }

  if (codecLower.includes('pcm') || codecLower.includes('wav')) {
    return 'WAV';
  }

  if (codecLower.includes('aiff')) {
    return 'AIFF';
  }

  if (codecLower.includes('ape') || codecLower.includes("monkey's audio")) {
    return 'APE';
  }

  if (codecLower.includes('wavpack') || codecLower.includes('wv')) {
    return 'WV';
  }

  // Opus
  if (codecLower.includes('opus')) {
    return 'OPUS';
  }

  // Ogg Vorbis
  if (codecLower.includes('vorbis') || codecLower.includes('ogg')) {
    return 'OGG';
  }

  // MP3
  if (codecLower.includes('mp3') || codecLower.includes('mpeg')) {
    // VBR detection — V0 is typically ~245 kbps, V2 ~190 kbps
    if (bitrateMode === 'VBR' || bitrateMode === 'Variable') {
      if (kbps >= 220) return 'MP3_V0';
      if (kbps >= 170) return 'MP3_V2';
      return 'MP3_192'; // fallback for lower VBR
    }
    // CBR
    if (kbps >= 310) return 'MP3_320';
    if (kbps >= 245) return 'MP3_256';
    if (kbps >= 180) return 'MP3_192';
    return 'MP3_128';
  }

  // AAC
  if (codecLower.includes('aac') || codecLower.includes('m4a')) {
    if (kbps >= 200) return 'AAC_256';
    return 'AAC_128';
  }

  return 'UNKNOWN';
}

export function getQualityScore(format: AudioFormat): number {
  return QUALITY_SCORES[format];
}

export function getFormatLabel(format: AudioFormat): string {
  return FORMAT_LABELS[format];
}

export function getQualityTier(format: AudioFormat): QualityTier {
  return getTier(QUALITY_SCORES[format]);
}

/**
 * Given an array of formats present in an album, return the best one.
 */
export function getBestFormat(formats: AudioFormat[]): AudioFormat {
  if (formats.length === 0) return 'UNKNOWN';
  return formats.reduce((best, fmt) =>
    QUALITY_SCORES[fmt] > QUALITY_SCORES[best] ? fmt : best
  );
}

// ─── Supported file extensions ───────────────────────────────────────

const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.wav',
  '.aiff',
  '.aif',
  '.ape',
  '.wv',
  '.alac',
]);

const COVER_ART_FILENAMES = new Set([
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'front.jpg',
  'front.jpeg',
  'front.png',
  'album.jpg',
  'album.jpeg',
  'album.png',
  'artwork.jpg',
  'artwork.jpeg',
  'artwork.png',
]);

export function isAudioFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

export function isCoverArt(filename: string): boolean {
  return COVER_ART_FILENAMES.has(filename.toLowerCase());
}
