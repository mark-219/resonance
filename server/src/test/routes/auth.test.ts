import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app.js';
import { cleanDatabase } from '../helpers/db.js';
import { createTestUser, createSessionCookie } from '../helpers/auth.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanDatabase();
});

// ─── POST /api/auth/login ───────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and sets cookie', async () => {
    const user = await createTestUser({ username: 'testuser', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'password123' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.username).toBe('testuser');
    expect(body.id).toBe(user.id);
    expect(body).not.toHaveProperty('passwordHash');

    // Check session cookie was set
    const cookies = res.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === 'session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
  });

  it('rejects invalid username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nonexistent', password: 'password123' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid credentials/i);
  });

  it('rejects wrong password', async () => {
    await createTestUser({ username: 'testuser', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'wrongpassword' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid credentials/i);
  });

  it('rejects empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /api/auth/logout ──────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('clears session cookie and returns success', async () => {
    const user = await createTestUser({ username: 'testuser' });
    const cookie = await createSessionCookie(user.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify session is invalidated — /me should fail
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(401);
  });

  it('succeeds even without a session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /api/auth/me ───────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns authenticated user profile', async () => {
    const user = await createTestUser({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      role: 'admin',
    });
    const cookie = await createSessionCookie(user.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(user.id);
    expect(body.username).toBe('testuser');
    expect(body.displayName).toBe('Test User');
    expect(body.email).toBe('test@example.com');
    expect(body.role).toBe('admin');
    expect(body).toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects expired/invalid session token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'session=invalid-token-that-does-not-exist' },
    });

    expect(res.statusCode).toBe(401);
  });
});
