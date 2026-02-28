import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { db } from '../../db/index.js';
import { libraries, artists, albums, tracks } from '../../db/schema.js';
import { buildTestApp } from '../helpers/app.js';
import { cleanDatabase } from '../helpers/db.js';
import { loginAsUser } from '../helpers/auth.js';

let app: FastifyInstance;
let cookie: string;
let tmpDir: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanDatabase();
  const auth = await loginAsUser(app);
  cookie = auth.cookie;

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resonance-stream-test-'));
  await fs.writeFile(path.join(tmpDir, 'test.flac'), Buffer.alloc(1024, 0xff));
});

afterEach(async () => {
  await cleanDatabase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createLocalTrack(format: string = 'FLAC') {
  const [artist] = await db
    .insert(artists)
    .values({ name: 'Test Artist' })
    .returning();

  const [library] = await db
    .insert(libraries)
    .values({ name: 'Test Library', localPath: tmpDir })
    .returning();

  const [album] = await db
    .insert(albums)
    .values({
      libraryId: library.id,
      artistId: artist.id,
      title: 'Test Album',
      localDirPath: tmpDir,
    })
    .returning();

  const [track] = await db
    .insert(tracks)
    .values({
      albumId: album.id,
      artistId: artist.id,
      title: 'Test Track',
      filePath: 'test.flac',
      format: format as any,
      isRemote: false,
    })
    .returning();

  return track;
}

describe('GET /api/stream/:trackId', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stream/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for non-existent track', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stream/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('streams a local FLAC file', async () => {
    const track = await createLocalTrack('FLAC');

    const res = await app.inject({
      method: 'GET',
      url: `/api/stream/${track.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/flac');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('1024');
  });

  it('supports Range requests', async () => {
    const track = await createLocalTrack('FLAC');

    const res = await app.inject({
      method: 'GET',
      url: `/api/stream/${track.id}`,
      headers: { cookie, range: 'bytes=0-511' },
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-511/1024');
    expect(res.headers['content-length']).toBe('512');
  });

  it('returns 415 for non-streamable format (ALAC)', async () => {
    const track = await createLocalTrack('ALAC');

    const res = await app.inject({
      method: 'GET',
      url: `/api/stream/${track.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(415);
    expect(res.json().error).toContain('not streamable');
  });
});
