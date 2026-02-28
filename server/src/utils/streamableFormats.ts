export const STREAMABLE_FORMATS = new Set([
  'FLAC_24', 'FLAC', 'WAV', 'AIFF',
  'MP3_V0', 'MP3_320', 'MP3_V2', 'MP3_256', 'MP3_192', 'MP3_128',
  'AAC_256', 'AAC_128', 'OGG', 'OPUS',
]);

export function isStreamableFormat(format: string): boolean {
  return STREAMABLE_FORMATS.has(format);
}
