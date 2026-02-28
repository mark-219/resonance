import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app.js';
import { cleanDatabase } from '../helpers/db.js';
import { createTestUser, createSessionCookie, loginAsAdmin, loginAsUser } from '../helpers/auth.js';

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

// ─── POST /api/users/setup ──────────────────────────────────────────

describe('POST /api/users/setup', () => {
  it('creates the first admin user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/setup',
      payload: { username: 'admin', password: 'password123' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.username).toBe('admin');
    expect(body.role).toBe('admin');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('rejects setup when an admin already exists', async () => {
    await createTestUser({ role: 'admin', username: 'existing-admin' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/setup',
      payload: { username: 'newadmin', password: 'password123' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/already completed/i);
  });

  it('rejects invalid input (missing username)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/setup',
      payload: { password: 'password123' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/setup',
      payload: { username: 'admin', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /api/users ─────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns paginated user list for admin', async () => {
    const { cookie } = await loginAsAdmin(app);
    await createTestUser({ username: 'user1' });
    await createTestUser({ username: 'user2' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(3); // admin + 2 users
    expect(body.pagination).toEqual(
      expect.objectContaining({ limit: 20, offset: 0, total: 3 })
    );
  });

  it('respects limit and offset parameters', async () => {
    const { cookie } = await loginAsAdmin(app);
    await createTestUser({ username: 'user1' });
    await createTestUser({ username: 'user2' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/users?limit=1&offset=1',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.pagination.total).toBe(3);
  });

  it('rejects non-admin users', async () => {
    const { cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /api/users/:id ─────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  it('admin can get any user', async () => {
    const { cookie } = await loginAsAdmin(app);
    const target = await createTestUser({ username: 'target' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe('target');
  });

  it('user can get themselves', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${user.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(user.id);
  });

  it('user cannot get another user', async () => {
    const { cookie } = await loginAsUser(app);
    const other = await createTestUser({ username: 'other' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${other.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /api/users ────────────────────────────────────────────────

describe('POST /api/users', () => {
  it('admin creates a new user with default role', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'newuser', password: 'password123' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.username).toBe('newuser');
    expect(body.role).toBe('user');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('admin creates a user with specific role', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'readonly1', password: 'password123', role: 'readonly' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('readonly');
  });

  it('admin creates a user with optional fields', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: {
        username: 'fulluser',
        password: 'password123',
        displayName: 'Full User',
        email: 'full@example.com',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.displayName).toBe('Full User');
    expect(body.email).toBe('full@example.com');
  });

  it('rejects duplicate username', async () => {
    const { cookie } = await loginAsAdmin(app);
    await createTestUser({ username: 'taken' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'taken', password: 'password123' },
    });

    expect(res.statusCode).toBe(500); // DB unique constraint error
  });

  it('rejects non-admin', async () => {
    const { cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: 'newuser', password: 'password123' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects invalid input', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { username: '', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── PATCH /api/users/:id ───────────────────────────────────────────

describe('PATCH /api/users/:id', () => {
  it('admin updates any user', async () => {
    const { cookie } = await loginAsAdmin(app);
    const target = await createTestUser({ username: 'target' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${target.id}`,
      headers: { cookie },
      payload: { displayName: 'Updated Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Updated Name');
  });

  it('admin can change user role', async () => {
    const { cookie } = await loginAsAdmin(app);
    const target = await createTestUser({ username: 'target', role: 'user' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${target.id}`,
      headers: { cookie },
      payload: { role: 'admin' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('admin');
  });

  it('user updates themselves', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${user.id}`,
      headers: { cookie },
      payload: { displayName: 'My New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('My New Name');
  });

  it('non-admin role change is silently ignored', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${user.id}`,
      headers: { cookie },
      payload: { role: 'admin', displayName: 'Hacker' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('user');
    expect(res.json().displayName).toBe('Hacker');
  });

  it('user cannot update another user', async () => {
    const { cookie } = await loginAsUser(app);
    const other = await createTestUser({ username: 'other' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${other.id}`,
      headers: { cookie },
      payload: { displayName: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
      payload: { displayName: 'Ghost' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── DELETE /api/users/:id ──────────────────────────────────────────

describe('DELETE /api/users/:id', () => {
  it('admin deletes a user', async () => {
    const { cookie } = await loginAsAdmin(app);
    const target = await createTestUser({ username: 'deleteme' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify user is gone
    const verify = await app.inject({
      method: 'GET',
      url: `/api/users/${target.id}`,
      headers: { cookie },
    });
    expect(verify.statusCode).toBe(404);
  });

  it('admin cannot delete themselves', async () => {
    const { user, cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${user.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/own account/i);
  });

  it('non-admin cannot delete users', async () => {
    const { cookie } = await loginAsUser(app);
    const target = await createTestUser({ username: 'target' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /api/users/:id/password ───────────────────────────────────

describe('POST /api/users/:id/password', () => {
  it('admin changes any user password without current password', async () => {
    const { cookie } = await loginAsAdmin(app);
    const target = await createTestUser({ username: 'target', password: 'oldpassword1' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${target.id}/password`,
      headers: { cookie },
      payload: { newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify new password works via login
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'target', password: 'newpassword1' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('user changes own password with current password', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${user.id}/password`,
      headers: { cookie },
      payload: { currentPassword: user.password, newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('user must provide current password', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${user.id}/password`,
      headers: { cookie },
      payload: { newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/current password/i);
  });

  it('rejects wrong current password', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${user.id}/password`,
      headers: { cookie },
      payload: { currentPassword: 'wrongpassword', newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/incorrect/i);
  });

  it('user cannot change another user password', async () => {
    const { cookie } = await loginAsUser(app);
    const other = await createTestUser({ username: 'other' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${other.id}/password`,
      headers: { cookie },
      payload: { currentPassword: 'testpassword123', newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects short new password', async () => {
    const { user, cookie } = await loginAsUser(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${user.id}/password`,
      headers: { cookie },
      payload: { currentPassword: user.password, newPassword: 'short' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent user', async () => {
    const { cookie } = await loginAsAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/00000000-0000-0000-0000-000000000000/password',
      headers: { cookie },
      payload: { newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(404);
  });
});
