import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { FormatBadge } from '@/components/music/FormatBadge';
import { cn } from '@/lib/cn';
import {
  Folder,
  FileAudio,
  File,
  ChevronRight,
  Server,
  HardDrive,
  ArrowUp,
} from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  format?: string;
}

type BrowseMode = 'remote' | 'local';

export function BrowsePage() {
  const [mode, setMode] = useState<BrowseMode>('remote');
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedHostId, setSelectedHostId] = useState<string>('');

  const { data: hosts } = useQuery({
    queryKey: ['remote-hosts'],
    queryFn: () =>
      apiFetch<{ id: string; name: string; host: string }[]>('/remote-hosts'),
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ['browse', mode, selectedHostId, currentPath],
    queryFn: () => {
      if (mode === 'remote' && selectedHostId) {
        return apiFetch<FileEntry[]>(
          `/browse/remote?hostId=${selectedHostId}&path=${encodeURIComponent(currentPath)}`
        );
      }
      return apiFetch<FileEntry[]>(
        `/browse/local?path=${encodeURIComponent(currentPath)}`
      );
    },
    enabled: mode === 'local' || !!selectedHostId,
  });

  const pathParts = currentPath.split('/').filter(Boolean);

  function navigateTo(path: string) {
    setCurrentPath(path);
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath('/' + parts.join('/'));
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Browse</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Explore files on your seedbox or local machine
        </p>
      </div>

      {/* Mode tabs + host selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center border border-border rounded overflow-hidden">
          <button
            onClick={() => setMode('remote')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              mode === 'remote'
                ? 'bg-surface-overlay text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <Server size={14} />
            Remote
          </button>
          <button
            onClick={() => setMode('local')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              mode === 'local'
                ? 'bg-surface-overlay text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <HardDrive size={14} />
            Local
          </button>
        </div>

        {mode === 'remote' && (
          <select
            value={selectedHostId}
            onChange={(e) => {
              setSelectedHostId(e.target.value);
              setCurrentPath('/');
            }}
            className="px-3 py-2 rounded bg-surface-raised border border-border text-sm text-text-primary cursor-pointer"
          >
            <option value="">Select host...</option>
            {hosts?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.host})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm">
        <button
          onClick={() => setCurrentPath('/')}
          className="text-text-secondary hover:text-accent transition-colors"
        >
          /
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-text-tertiary" />
            <button
              onClick={() => navigateTo('/' + pathParts.slice(0, i + 1).join('/'))}
              className={cn(
                'transition-colors',
                i === pathParts.length - 1
                  ? 'text-text-primary font-medium'
                  : 'text-text-secondary hover:text-accent'
              )}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="bg-surface-raised border border-border-subtle rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 py-2 border-b border-border-subtle text-xs text-text-tertiary uppercase tracking-wider">
          <span className="flex-1">Name</span>
          <span className="w-24 text-right">Size</span>
          <span className="w-20 text-right">Format</span>
        </div>

        {/* Up directory */}
        {currentPath !== '/' && (
          <button
            onClick={navigateUp}
            className="flex items-center w-full px-4 py-2.5 hover:bg-surface-overlay transition-colors text-left"
          >
            <ArrowUp size={16} className="text-text-tertiary mr-3" />
            <span className="text-sm text-text-secondary">..</span>
          </button>
        )}

        {/* Entries */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !entries?.length ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-text-tertiary">Empty directory</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              onClick={() => entry.isDirectory && navigateTo(entry.path)}
              className={cn(
                'flex items-center px-4 py-2.5 border-t border-border-subtle transition-colors',
                entry.isDirectory
                  ? 'cursor-pointer hover:bg-surface-overlay'
                  : 'cursor-default'
              )}
            >
              <div className="mr-3">
                {entry.isDirectory ? (
                  <Folder size={16} className="text-accent-muted" />
                ) : entry.format ? (
                  <FileAudio size={16} className="text-text-tertiary" />
                ) : (
                  <File size={16} className="text-text-tertiary" />
                )}
              </div>
              <span className="flex-1 text-sm text-text-primary truncate">
                {entry.name}
              </span>
              <span className="w-24 text-right text-xs text-text-tertiary font-mono">
                {entry.isDirectory ? '—' : formatSize(entry.size)}
              </span>
              <span className="w-20 text-right">
                {entry.format && <FormatBadge format={entry.format} />}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
