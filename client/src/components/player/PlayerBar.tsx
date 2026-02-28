import { usePlayerStore } from '@/stores/playerStore';
import { cn } from '@/lib/cn';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { FormatBadge } from '../music/FormatBadge';

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    pause,
    resume,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
  } = usePlayerStore();

  if (!currentTrack) {
    return (
      <div className="h-20 border-t border-border-subtle bg-surface-sunken flex items-center justify-center">
        <span className="text-sm text-text-tertiary">No track playing</span>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="h-20 border-t border-border-subtle bg-surface-sunken flex items-center px-4 gap-6">
      {/* Track info */}
      <div className="flex items-center gap-3 w-64 min-w-0">
        <div
          className="w-12 h-12 rounded bg-surface-overlay flex items-center justify-center shrink-0"
          aria-label="Album art"
        >
          <span className="text-text-tertiary text-xs">♪</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {currentTrack.title}
          </p>
          <p className="text-xs text-text-secondary truncate">{currentTrack.artist}</p>
        </div>
        <FormatBadge format={currentTrack.format} className="shrink-0" />
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center flex-1 gap-1">
        <div className="flex items-center gap-4">
          <button
            onClick={previous}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={isPlaying ? pause : resume}
            className="p-2 rounded-full bg-text-primary text-text-inverse hover:bg-text-secondary transition-colors"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button
            onClick={next}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 w-full max-w-lg">
          <span className="text-2xs text-text-tertiary font-mono w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <div
            className="flex-1 h-1 bg-border rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seek(pct * duration);
            }}
          >
            <div
              className="h-full bg-accent rounded-full relative transition-all group-hover:h-1.5"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-2xs text-text-tertiary font-mono w-10">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-36">
        <button
          onClick={toggleMute}
          className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
        >
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-accent cursor-pointer"
        />
      </div>
    </div>
  );
}
