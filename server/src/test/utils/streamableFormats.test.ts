import { describe, it, expect } from 'vitest';
import { isStreamableFormat, STREAMABLE_FORMATS } from '../../utils/streamableFormats.js';

describe('isStreamableFormat', () => {
  it('returns true for FLAC', () => {
    expect(isStreamableFormat('FLAC')).toBe(true);
  });

  it('returns true for FLAC_24', () => {
    expect(isStreamableFormat('FLAC_24')).toBe(true);
  });

  it('returns true for all MP3 variants', () => {
    for (const fmt of ['MP3_V0', 'MP3_320', 'MP3_V2', 'MP3_256', 'MP3_192', 'MP3_128']) {
      expect(isStreamableFormat(fmt)).toBe(true);
    }
  });

  it('returns true for AAC variants', () => {
    expect(isStreamableFormat('AAC_256')).toBe(true);
    expect(isStreamableFormat('AAC_128')).toBe(true);
  });

  it('returns true for OGG, OPUS, WAV, AIFF', () => {
    for (const fmt of ['OGG', 'OPUS', 'WAV', 'AIFF']) {
      expect(isStreamableFormat(fmt)).toBe(true);
    }
  });

  it('returns false for ALAC', () => {
    expect(isStreamableFormat('ALAC')).toBe(false);
  });

  it('returns false for APE, WV, UNKNOWN', () => {
    for (const fmt of ['APE', 'WV', 'UNKNOWN']) {
      expect(isStreamableFormat(fmt)).toBe(false);
    }
  });
});
