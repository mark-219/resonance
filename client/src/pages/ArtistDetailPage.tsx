import { useParams, useNavigate } from 'react-router-dom';
import { useArtist } from '@/api/hooks';
import { FormatBadge } from '@/components/music/FormatBadge';
import { ArrowLeft, Music, Users } from 'lucide-react';

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: artist, isLoading } = useArtist(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Artist not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Artist header */}
      <div className="flex gap-5 items-center">
        <div className="w-24 h-24 rounded-full bg-surface-overlay border border-border-subtle flex items-center justify-center shrink-0">
          <Users size={32} className="text-text-tertiary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{artist.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {artist.albums.length} {artist.albums.length === 1 ? 'album' : 'albums'}
          </p>
          {artist.metadata?.genres && artist.metadata.genres.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {artist.metadata.genres.map((g) => (
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

      {/* Album grid */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-3">Discography</h2>
        {artist.albums.length === 0 ? (
          <p className="text-sm text-text-tertiary">No albums found for this artist.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {artist.albums.map((album) => (
              <div
                key={album.id}
                className="group cursor-pointer"
                onClick={() => navigate(`/albums/${album.id}`)}
              >
                <div className="aspect-square rounded bg-surface-overlay border border-border-subtle flex items-center justify-center mb-2 overflow-hidden group-hover:border-border-strong transition-colors">
                  <Music size={32} className="text-text-tertiary" />
                </div>
                <p className="text-sm font-medium text-text-primary truncate">
                  {album.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {album.year && (
                    <span className="text-xs text-text-tertiary">{album.year}</span>
                  )}
                  {album.bestFormat && <FormatBadge format={album.bestFormat} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
