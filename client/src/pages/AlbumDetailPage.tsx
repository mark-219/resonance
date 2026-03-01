import { useParams, useNavigate } from 'react-router-dom';
import { useAlbum } from '@/api/hooks';
import { FormatBadge } from '@/components/music/FormatBadge';
import { ArrowLeft, Music, Clock, Volume2 } from 'lucide-react';
import { usePlayerStore, type PlayerTrack } from '@/stores/playerStore';
import { isStreamableFormat } from '@/utils/streamableFormats';
import type { Track } from '@/api/hooks';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes > 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes > 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatSampleRate(hz: number | null): string {
  if (!hz) return '';
  return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`;
}

function toPlayerTrack(
  track: Track,
  album: { title: string; artist?: { name: string } | null }
): PlayerTrack {
  return {
    id: track.id,
    title: track.title,
    artist: album.artist?.name,
    album: album.title,
    duration: track.duration ?? undefined,
    format: track.format,
    bitrate: track.bitrate ?? undefined,
    sampleRate: track.sampleRate ?? undefined,
    bitDepth: track.bitDepth ?? undefined,
  };
}

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: album, isLoading } = useAlbum(id);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Album not found.</p>
      </div>
    );
  }

  const totalDuration = album.tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const totalSize = album.tracks.reduce((sum, t) => sum + (t.fileSize ?? 0), 0);

  const hasMultipleDiscs = album.tracks.some((t) => t.discNumber && t.discNumber > 1);
  const discGroups = new Map<number, typeof album.tracks>();
  for (const track of album.tracks) {
    const disc = track.discNumber ?? 1;
    if (!discGroups.has(disc)) discGroups.set(disc, []);
    discGroups.get(disc)!.push(track);
  }

  const sortedTracks = [...album.tracks].sort((a, b) => {
    const discDiff = (a.discNumber ?? 1) - (b.discNumber ?? 1);
    if (discDiff !== 0) return discDiff;
    return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
  });

  function handleTrackClick(track: Track) {
    if (!isStreamableFormat(track.format)) return;

    const playerTracks = sortedTracks
      .filter((t) => isStreamableFormat(t.format))
      .map((t) => toPlayerTrack(t, album!));

    const startIndex = playerTracks.findIndex((t) => t.id === track.id);
    if (startIndex === -1) return;

    playTrack(playerTracks[startIndex], playerTracks, startIndex);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex gap-6">
        <div className="w-48 h-48 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center shrink-0">
          <Music size={48} className="text-text-tertiary" />
        </div>
        <div className="flex-1 min-w-0 pt-2">
          <h1 className="text-2xl font-bold text-text-primary">{album.title}</h1>
          {album.artist && (
            <button
              onClick={() => navigate(`/artists/${album.artist!.id}`)}
              className="text-sm text-accent hover:underline mt-1"
            >
              {album.artist.name}
            </button>
          )}
          <div className="flex items-center gap-3 mt-3 text-xs text-text-secondary">
            {album.year && <span>{album.year}</span>}
            <span>{album.tracks.length} tracks</span>
            <span>{formatDuration(totalDuration)}</span>
            <span>{formatFileSize(totalSize)}</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {album.formats?.map((f) => (
              <FormatBadge key={f} format={f} showFull />
            ))}
            {album.seedOnly && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary border border-border-subtle">
                seed only
              </span>
            )}
          </div>
          {album.metadata?.genres && album.metadata.genres.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {album.metadata.genres.map((g) => (
                <span
                  key={g}
                  className="text-2xs px-2 py-0.5 rounded-full bg-surface-overlay text-text-secondary border border-border-subtle"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface-raised border border-border-subtle rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_auto_5rem_5rem] gap-3 px-4 py-2 text-2xs text-text-tertiary uppercase tracking-wider border-b border-border-subtle">
          <span>#</span>
          <span>Title</span>
          <span>Format</span>
          <span className="text-right">
            <Clock size={12} className="inline" />
          </span>
          <span className="text-right">Size</span>
        </div>

        {[...discGroups.entries()].map(([disc, discTracks]) => (
          <div key={disc}>
            {hasMultipleDiscs && (
              <div className="px-4 py-2 text-xs text-text-tertiary font-medium border-b border-border-subtle bg-surface/50">
                Disc {disc}
              </div>
            )}
            {discTracks
              .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
              .map((track) => {
                const streamable = isStreamableFormat(track.format);
                const isCurrent = currentTrack?.id === track.id;

                return (
                  <div
                    key={track.id}
                    onClick={() => handleTrackClick(track)}
                    className={`grid grid-cols-[2rem_1fr_auto_5rem_5rem] gap-3 px-4 py-2.5 transition-colors items-center ${
                      streamable
                        ? 'hover:bg-surface-overlay cursor-pointer group'
                        : 'opacity-50 cursor-not-allowed'
                    } ${isCurrent ? 'bg-surface-overlay' : ''}`}
                    title={streamable ? undefined : 'Format not playable in browser'}
                  >
                    <span className="text-xs tabular-nums">
                      {isCurrent && isPlaying ? (
                        <Volume2 size={14} className="text-accent" />
                      ) : (
                        <span className="text-text-tertiary">
                          {track.trackNumber ?? '—'}
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm truncate transition-colors ${
                          isCurrent
                            ? 'text-accent font-medium'
                            : streamable
                              ? 'text-text-primary group-hover:text-accent'
                              : 'text-text-tertiary'
                        }`}
                      >
                        {track.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <FormatBadge format={track.format} />
                      {track.sampleRate && (
                        <span className="text-2xs text-text-tertiary font-mono">
                          {formatSampleRate(track.sampleRate)}
                          {track.bitDepth ? `/${track.bitDepth}` : ''}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary tabular-nums text-right">
                      {formatDuration(track.duration)}
                    </span>
                    <span className="text-xs text-text-tertiary tabular-nums text-right">
                      {formatFileSize(track.fileSize)}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
