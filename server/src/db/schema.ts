import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'user', 'readonly']);

export const audioFormatEnum = pgEnum('audio_format', [
  'FLAC_24',
  'FLAC',
  'ALAC',
  'WAV',
  'AIFF',
  'APE',
  'WV',
  'MP3_V0',
  'MP3_320',
  'MP3_V2',
  'MP3_256',
  'MP3_192',
  'MP3_128',
  'AAC_256',
  'AAC_128',
  'OGG',
  'OPUS',
  'UNKNOWN',
]);

export const scanJobStatusEnum = pgEnum('scan_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const collectionTypeEnum = pgEnum('collection_type', [
  'albums',
  'tracks',
  'mixed',
]);

// ─── Users ───────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRoleEnum('role').notNull().default('user'),
    // OIDC fields
    oidcSubject: varchar('oidc_subject', { length: 512 }),
    oidcIssuer: varchar('oidc_issuer', { length: 512 }),
    avatarUrl: varchar('avatar_url', { length: 1024 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_users_oidc').on(table.oidcSubject, table.oidcIssuer)]
);

// ─── Sessions ────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 512 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Remote Hosts ────────────────────────────────────────────────────

export const remoteHosts = pgTable('remote_hosts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull().default(22),
  username: varchar('username', { length: 255 }).notNull(),
  privateKeyPath: varchar('private_key_path', { length: 1024 }),
  hostFingerprint: varchar('host_fingerprint', { length: 512 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Libraries ───────────────────────────────────────────────────────

export const libraries = pgTable('libraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  remoteHostId: uuid('remote_host_id').references(() => remoteHosts.id),
  remotePath: varchar('remote_path', { length: 1024 }),
  localPath: varchar('local_path', { length: 1024 }),
  lastScannedAt: timestamp('last_scanned_at'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Artists ─────────────────────────────────────────────────────────

export const artists = pgTable(
  'artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 512 }).notNull(),
    sortName: varchar('sort_name', { length: 512 }),
    musicBrainzId: varchar('musicbrainz_id', { length: 64 }),
    metadata: jsonb('metadata').$type<{
      bio?: string;
      genres?: string[];
      imageUrl?: string;
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_artists_name').on(table.name)]
);

// ─── Albums ──────────────────────────────────────────────────────────

export const albums = pgTable(
  'albums',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id').references(() => artists.id),
    title: varchar('title', { length: 512 }).notNull(),
    year: integer('year'),
    remoteDirPath: varchar('remote_dir_path', { length: 1024 }),
    localDirPath: varchar('local_dir_path', { length: 1024 }),
    formats: jsonb('formats').$type<string[]>().default([]),
    bestFormat: audioFormatEnum('best_format'),
    seedOnly: boolean('seed_only').notNull().default(false),
    coverArtPath: varchar('cover_art_path', { length: 1024 }),
    metadata: jsonb('metadata').$type<{
      genres?: string[];
      label?: string;
      catalogNumber?: string;
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_albums_library').on(table.libraryId),
    index('idx_albums_artist').on(table.artistId),
  ]
);

// ─── Tracks ──────────────────────────────────────────────────────────

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id').references(() => artists.id),
    title: varchar('title', { length: 512 }).notNull(),
    trackNumber: integer('track_number'),
    discNumber: integer('disc_number'),
    duration: integer('duration'),
    filePath: varchar('file_path', { length: 1024 }).notNull(),
    format: audioFormatEnum('format').notNull().default('UNKNOWN'),
    bitrate: integer('bitrate'),
    sampleRate: integer('sample_rate'),
    bitDepth: integer('bit_depth'),
    fileSize: integer('file_size'),
    isRemote: boolean('is_remote').notNull().default(true),
    metadata: jsonb('metadata').$type<{
      codec?: string;
      bitrateMode?: string;
      lossless?: boolean;
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_tracks_album').on(table.albumId),
    index('idx_tracks_format').on(table.format),
  ]
);

// ─── Playlists ───────────────────────────────────────────────────────

export const playlists = pgTable('playlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  coverImageUrl: varchar('cover_image_url', { length: 1024 }),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => [index('idx_playlist_tracks_playlist').on(table.playlistId)]
);

// ─── Collections ─────────────────────────────────────────────────────

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: collectionTypeEnum('type').notNull().default('mixed'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const collectionItems = pgTable(
  'collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    albumId: uuid('album_id').references(() => albums.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => tracks.id, {
      onDelete: 'cascade',
    }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => [index('idx_collection_items_collection').on(table.collectionId)]
);

// ─── Scan Jobs ───────────────────────────────────────────────────────

export const scanJobs = pgTable(
  'scan_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    status: scanJobStatusEnum('status').notNull().default('pending'),
    progress: integer('progress').default(0),
    totalItems: integer('total_items'),
    logOutput: text('log_output'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [index('idx_scan_jobs_library').on(table.libraryId)]
);
