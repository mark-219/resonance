import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlbums, type Album } from '@/api/hooks';
import { FormatBadge } from '@/components/music/FormatBadge';
import { Search, Grid3X3, List, Music } from 'lucide-react';
import { cn } from '@/lib/cn';

type ViewMode = 'grid' | 'list';

export function LibraryPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [showSeedOnly, setShowSeedOnly] = useState(false);

  const { data, isLoading } = useAlbums({
    search: search || undefined,
    format: formatFilter !== 'all' ? formatFilter : undefined,
    seedOnly: showSeedOnly || undefined,
  });

  const albums = data?.data ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Library</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {total.toLocaleString()} albums
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search albums or artists..."
            className="w-full pl-9 pr-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent transition-colors"
          />
        </div>

        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary cursor-pointer"
        >
          <option value="all">All Formats</option>
          <option value="FLAC_24">FLAC 24-bit</option>
          <option value="FLAC">FLAC</option>
          <option value="ALAC">ALAC</option>
          <option value="MP3_V0">V0</option>
          <option value="MP3_320">320</option>
          <option value="MP3_V2">V2</option>
          <option value="AAC_256">AAC 256</option>
          <option value="OPUS">Opus</option>
          <option value="OGG">OGG</option>
        </select>

        <button
          onClick={() => setShowSeedOnly(!showSeedOnly)}
          className={cn(
            'px-3 py-2 rounded border text-sm transition-colors',
            showSeedOnly
              ? 'bg-accent-subtle border-accent/30 text-accent'
              : 'bg-surface-raised border-border text-text-secondary hover:text-text-primary'
          )}
        >
          Seed Only
        </button>

        <div className="flex items-center border border-border rounded overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'grid'
                ? 'bg-surface-overlay text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'list'
                ? 'bg-surface-overlay text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Music size={40} className="text-text-tertiary mb-3" />
          <p className="text-sm text-text-secondary">No albums found</p>
          <p className="text-xs text-text-tertiary mt-1">
            Add a library and run a scan to populate your collection.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              onClick={() => navigate(`/albums/${album.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {albums.map((album) => (
            <AlbumRow
              key={album.id}
              album={album}
              onClick={() => navigate(`/albums/${album.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumCard({ album, onClick }: { album: Album; onClick: () => void }) {
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="aspect-square rounded bg-surface-overlay border border-border-subtle flex items-center justify-center mb-2 overflow-hidden group-hover:border-border-strong transition-colors">
        <Music size={32} className="text-text-tertiary" />
      </div>
      <p className="text-sm font-medium text-text-primary truncate">{album.title}</p>
      <p className="text-xs text-text-secondary truncate">
        {album.artistName ?? 'Unknown Artist'}
        {album.year && ` \u00b7 ${album.year}`}
      </p>
      <div className="flex items-center gap-1 mt-1">
        {album.bestFormat && <FormatBadge format={album.bestFormat} />}
        {album.seedOnly && (
          <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary border border-border-subtle">
            seed
          </span>
        )}
      </div>
    </div>
  );
}

function AlbumRow({ album, onClick }: { album: Album; onClick: () => void }) {
  return (
    <div
      className="flex items-center gap-4 px-3 py-2.5 rounded hover:bg-surface-raised transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded bg-surface-overlay flex items-center justify-center shrink-0">
        <Music size={16} className="text-text-tertiary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{album.title}</p>
        <p className="text-xs text-text-secondary truncate">
          {album.artistName ?? 'Unknown Artist'}
        </p>
      </div>
      <span className="text-xs text-text-tertiary">{album.year}</span>
      <div className="flex items-center gap-1.5">
        {album.formats?.map((f) => (
          <FormatBadge key={f} format={f} />
        ))}
      </div>
      {album.seedOnly && (
        <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-tertiary border border-border-subtle">
          seed
        </span>
      )}
    </div>
  );
}
