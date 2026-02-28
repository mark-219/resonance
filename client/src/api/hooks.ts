/**
 * TanStack Query hooks for all API endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

// ─── Types ────────────────────────────────────────────────────────────

interface Paginated<T> {
  data: T[];
  pagination: { limit: number; offset: number; total: number };
}

export interface Album {
  id: string;
  libraryId: string;
  artistId: string | null;
  title: string;
  year: number | null;
  formats: string[];
  bestFormat: string | null;
  seedOnly: boolean;
  coverArtPath: string | null;
  metadata: { genres?: string[]; label?: string; catalogNumber?: string } | null;
  createdAt: string;
  updatedAt: string;
  artistName: string | null; // from join
}

export interface AlbumDetail extends Omit<Album, 'artistName'> {
  artist: {
    id: string;
    name: string;
    sortName: string | null;
    musicBrainzId: string | null;
  } | null;
  tracks: Track[];
}

export interface Track {
  id: string;
  albumId: string;
  artistId: string | null;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number | null;
  format: string;
  filePath: string;
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  fileSize: number | null;
  isRemote: boolean;
  metadata: { codec?: string; bitrateMode?: string; lossless?: boolean } | null;
  createdAt: string;
}

export interface Artist {
  id: string;
  name: string;
  sortName: string | null;
  metadata: { bio?: string; genres?: string[]; imageUrl?: string } | null;
  createdAt: string;
  albumCount: number;
}

export interface ArtistDetail extends Omit<Artist, 'albumCount'> {
  albums: {
    id: string;
    title: string;
    year: number | null;
    formats: string[];
    bestFormat: string | null;
    coverArtPath: string | null;
    seedOnly: boolean;
  }[];
}

export interface Library {
  id: string;
  name: string;
  remoteHostId: string | null;
  remotePath: string | null;
  localPath: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  remoteHostName: string | null;
}

export interface Stats {
  libraries: number;
  remoteHosts: number;
  artists: number;
  albums: number;
  tracks: number;
}

export interface ScanJob {
  id: string;
  libraryId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number | null;
  totalItems: number | null;
  logOutput: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RemoteHost {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hostFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  fingerprint?: string;
  needsAcceptance?: boolean;
}

// ─── Stats ───────────────────────────────────────────────────────────

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<Stats>('/stats'),
    staleTime: 10_000,
  });
}

// ─── Libraries ───────────────────────────────────────────────────────

export function useLibraries() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: () => apiFetch<Paginated<Library>>('/libraries?limit=100'),
  });
}

export function useCreateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      localPath?: string;
      remoteHostId?: string;
      remotePath?: string;
    }) => apiFetch<Library>('/libraries', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['libraries'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useScanLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (libraryId: string) =>
      apiFetch<{ jobId: string; status: string; message: string }>(
        `/libraries/${libraryId}/scan`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanJobs'] });
    },
  });
}

export function useDeleteLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/libraries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['libraries'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUpdateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      remotePath?: string;
      localPath?: string;
    }) =>
      apiFetch<Library>(`/libraries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

export function useScanJobs(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['scanJobs', libraryId],
    queryFn: () => apiFetch<Paginated<ScanJob>>(`/libraries/${libraryId}/jobs?limit=10`),
    enabled: !!libraryId,
    refetchInterval: 5000, // Poll while scan is running
  });
}

// ─── Albums ──────────────────────────────────────────────────────────

export function useAlbums(params: {
  search?: string;
  format?: string;
  seedOnly?: boolean;
  libraryId?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.format && params.format !== 'all') searchParams.set('format', params.format);
  if (params.seedOnly) searchParams.set('seedOnly', 'true');
  if (params.libraryId) searchParams.set('libraryId', params.libraryId);
  searchParams.set('limit', String(params.limit ?? 60));
  searchParams.set('offset', String(params.offset ?? 0));

  return useQuery({
    queryKey: ['albums', Object.fromEntries(searchParams)],
    queryFn: () => apiFetch<Paginated<Album>>(`/albums?${searchParams.toString()}`),
  });
}

export function useAlbum(id: string | undefined) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => apiFetch<AlbumDetail>(`/albums/${id}`),
    enabled: !!id,
  });
}

// ─── Artists ─────────────────────────────────────────────────────────

export function useArtists(params: { search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('limit', String(params.limit ?? 50));
  searchParams.set('offset', String(params.offset ?? 0));

  return useQuery({
    queryKey: ['artists', Object.fromEntries(searchParams)],
    queryFn: () => apiFetch<Paginated<Artist>>(`/artists?${searchParams.toString()}`),
  });
}

export function useArtist(id: string | undefined) {
  return useQuery({
    queryKey: ['artist', id],
    queryFn: () => apiFetch<ArtistDetail>(`/artists/${id}`),
    enabled: !!id,
  });
}

// ─── Remote Hosts ───────────────────────────────────────────────────

export function useRemoteHosts() {
  return useQuery({
    queryKey: ['remoteHosts'],
    queryFn: () => apiFetch<RemoteHost[]>('/remote-hosts'),
  });
}

export function useCreateRemoteHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      host: string;
      port?: number;
      username: string;
      privateKeyPath?: string;
    }) =>
      apiFetch<RemoteHost>('/remote-hosts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remoteHosts'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUpdateRemoteHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      privateKeyPath?: string;
    }) =>
      apiFetch<RemoteHost>(`/remote-hosts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remoteHosts'] });
    },
  });
}

export function useDeleteRemoteHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/remote-hosts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remoteHosts'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      acceptFingerprint = false,
    }: {
      id: string;
      acceptFingerprint?: boolean;
    }) =>
      apiFetch<TestConnectionResult>(`/remote-hosts/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({ acceptFingerprint }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remoteHosts'] });
    },
  });
}
