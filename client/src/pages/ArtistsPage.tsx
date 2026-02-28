import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtists } from '@/api/hooks';
import { Search, Users } from 'lucide-react';

export function ArtistsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useArtists({
    search: search || undefined,
    limit: 100,
  });

  const artists = data?.data ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Artists</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {total.toLocaleString()} artists
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search artists..."
          className="w-full pl-9 pr-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : artists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={40} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-secondary">No artists found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {artists.map((artist) => (
            <div
              key={artist.id}
              onClick={() => navigate(`/artists/${artist.id}`)}
              className="flex items-center gap-4 px-3 py-3 rounded hover:bg-surface-raised transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-surface-overlay border border-border-subtle flex items-center justify-center shrink-0">
                <Users size={16} className="text-text-tertiary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{artist.name}</p>
                {artist.metadata?.genres && artist.metadata.genres.length > 0 && (
                  <p className="text-xs text-text-tertiary truncate">
                    {artist.metadata.genres.join(', ')}
                  </p>
                )}
              </div>
              <span className="text-xs text-text-tertiary">
                {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
