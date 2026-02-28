import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, sessions } from '../../db/schema.js';

const DEFAULT_PASSWORD = 'testpassword123';

interface CreateTestUserOptions {
  username?: string;
  password?: string;
  role?: 'admin' | 'user' | 'readonly';
  displayName?: string;
  email?: string;
}

export async function createTestUser(options: CreateTestUserOptions = {}) {
  const {
    username = `user_${randomBytes(4).toString('hex')}`,
    password = DEFAULT_PASSWORD,
    role = 'user',
    displayName,
    email,
  } = options;

  const passwordHash = await bcrypt.hash(password, 1);

  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role, displayName, email })
    .returning();

  return { ...user, password };
}

export async function createSessionCookie(userId: string): Promise<string> {
  const token = randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.insert(sessions).values({ userId, token, expiresAt });

  return `session=${token}`;
}

export async function loginAsAdmin(app: FastifyInstance) {
  const user = await createTestUser({ role: 'admin' });
  const cookie = await createSessionCookie(user.id);
  return { user, cookie };
}

export async function loginAsUser(app: FastifyInstance) {
  const user = await createTestUser({ role: 'user' });
  const cookie = await createSessionCookie(user.id);
  return { user, cookie };
}
