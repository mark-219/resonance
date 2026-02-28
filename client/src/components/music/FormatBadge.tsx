import { cn } from '@/lib/cn';

const FORMAT_CONFIG: Record<
  string,
  { label: string; tier: 'lossless' | 'high' | 'mid' | 'low' }
> = {
  FLAC_24: { label: 'FLAC 24-bit', tier: 'lossless' },
  FLAC: { label: 'FLAC', tier: 'lossless' },
  ALAC: { label: 'ALAC', tier: 'lossless' },
  WAV: { label: 'WAV', tier: 'lossless' },
  AIFF: { label: 'AIFF', tier: 'lossless' },
  APE: { label: 'APE', tier: 'lossless' },
  WV: { label: 'WavPack', tier: 'lossless' },
  MP3_V0: { label: 'V0', tier: 'high' },
  MP3_320: { label: '320', tier: 'high' },
  MP3_V2: { label: 'V2', tier: 'mid' },
  MP3_256: { label: '256', tier: 'mid' },
  MP3_192: { label: '192', tier: 'low' },
  MP3_128: { label: '128', tier: 'low' },
  AAC_256: { label: 'AAC 256', tier: 'mid' },
  AAC_128: { label: 'AAC 128', tier: 'low' },
  OGG: { label: 'OGG', tier: 'mid' },
  OPUS: { label: 'Opus', tier: 'high' },
  UNKNOWN: { label: '?', tier: 'low' },
};

const TIER_STYLES = {
  lossless: 'bg-quality-lossless/15 text-quality-lossless border-quality-lossless/25',
  high: 'bg-quality-high/15 text-quality-high border-quality-high/25',
  mid: 'bg-quality-mid/15 text-quality-mid border-quality-mid/25',
  low: 'bg-quality-low/15 text-quality-low border-quality-low/25',
};

interface FormatBadgeProps {
  format: string;
  className?: string;
  showFull?: boolean;
}

export function FormatBadge({ format, className, showFull }: FormatBadgeProps) {
  const config = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.UNKNOWN;
  const tierStyle = TIER_STYLES[config.tier];

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded border text-2xs font-mono font-medium',
        tierStyle,
        className
      )}
    >
      {showFull ? config.label : config.label}
    </span>
  );
}

export function QualityIndicator({ format }: { format: string }) {
  const config = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.UNKNOWN;

  const tierLabel = {
    lossless: 'Hi-Fi',
    high: 'High',
    mid: 'Mid',
    low: 'Low',
  }[config.tier];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn('w-2 h-2 rounded-full', {
          'bg-quality-lossless': config.tier === 'lossless',
          'bg-quality-high': config.tier === 'high',
          'bg-quality-mid': config.tier === 'mid',
          'bg-quality-low': config.tier === 'low',
        })}
      />
      <span className="text-2xs text-text-secondary font-medium uppercase tracking-wider">
        {tierLabel}
      </span>
    </div>
  );
}
