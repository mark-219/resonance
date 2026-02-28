import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users, sessions } from '../db/schema.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Schemas ──────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1),
});

const oidcCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

// ─── Constants ────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = 'session';
const SESSION_EXPIRY_DAYS = 30;
const SESSION_TOKEN_LENGTH = 64;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 10;

// ─── Rate limiting (in-memory, simple implementation) ─────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

// ─── Helper functions ────────────────────────────────────────────────

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
}

function getSessionExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_EXPIRY_DAYS);
  return date;
}

async function createSession(userId: string, reply: FastifyReply): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = getSessionExpiry();

  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });

  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  });

  return token;
}

async function clearSession(reply: FastifyReply): Promise<void> {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// ─── Route handlers ──────────────────────────────────────────────────

async function loginHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Rate limiting
  const clientIp = request.ip;
  if (!checkRateLimit(clientIp)) {
    return reply
      .status(429)
      .send({ error: 'Too many login attempts. Please try again later.' });
  }

  if (!config.LOCAL_AUTH_ENABLED) {
    return reply.status(400).send({ error: 'Local authentication is disabled' });
  }

  const body = loginSchema.safeParse(request.body);
  if (!body.success) {
    return reply
      .status(400)
      .send({ error: 'Invalid request', issues: body.error.issues });
  }

  const { username, password } = body.data;

  // Find user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user || !user.passwordHash) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  // Create session
  await createSession(user.id, reply);

  return reply.send({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
  });
}

async function oidcLoginHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID) {
    return reply.status(400).send({ error: 'OIDC is not configured' });
  }

  // Generate PKCE code challenge
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('hex');
  const codeChallenge = randomBytes(32).toString('hex'); // Simplified; in production use proper PKCE

  // Store state in session/cookie for verification
  reply.setCookie('oidc_state', state, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  // Construct authorization URL
  const authorizationEndpoint = `${config.OIDC_ISSUER}/o/authorize/`;
  const params = new URLSearchParams({
    client_id: config.OIDC_CLIENT_ID,
    redirect_uri: config.OIDC_REDIRECT_URI || `${config.CORS_ORIGIN}/auth/oidc/callback`,
    response_type: 'code',
    scope: 'openid profile email',
    state,
  });

  return reply.redirect(`${authorizationEndpoint}?${params.toString()}`);
}

async function oidcCallbackHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID || !config.OIDC_CLIENT_SECRET) {
    return reply.status(400).send({ error: 'OIDC is not configured' });
  }

  const query = oidcCallbackSchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({ error: 'Invalid callback parameters' });
  }

  const { code, state } = query.data;

  // Verify state
  const storedState = request.cookies.oidc_state;
  if (!state || state !== storedState) {
    return reply.status(400).send({ error: 'Invalid state parameter' });
  }

  try {
    // Exchange code for token (simplified - normally done server-side with client secret)
    const tokenEndpoint = `${config.OIDC_ISSUER}/o/token/`;
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.OIDC_CLIENT_ID,
        client_secret: config.OIDC_CLIENT_SECRET,
        redirect_uri:
          config.OIDC_REDIRECT_URI || `${config.CORS_ORIGIN}/auth/oidc/callback`,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      id_token?: string;
    };

    // Fetch user info
    const userInfoEndpoint = `${config.OIDC_ISSUER}/o/userinfo/`;
    const userInfoResponse = await fetch(userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const userInfo = (await userInfoResponse.json()) as {
      sub: string;
      preferred_username: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    // Find or create user
    let user = (
      await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.oidcSubject, userInfo.sub),
            eq(users.oidcIssuer, config.OIDC_ISSUER)
          )
        )
        .limit(1)
    )[0];

    if (!user) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username: userInfo.preferred_username,
          email: userInfo.email,
          displayName: userInfo.name,
          avatarUrl: userInfo.picture,
          oidcSubject: userInfo.sub,
          oidcIssuer: config.OIDC_ISSUER,
          role: 'user',
        })
        .returning();

      user = newUser;
    } else {
      // Update user if needed
      if (
        user.email !== userInfo.email ||
        user.displayName !== userInfo.name ||
        user.avatarUrl !== userInfo.picture
      ) {
        const [updated] = await db
          .update(users)
          .set({
            email: userInfo.email,
            displayName: userInfo.name,
            avatarUrl: userInfo.picture,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();

        user = updated;
      }
    }

    // Create session
    await createSession(user.id, reply);

    return reply.send({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Authentication failed' });
  }
}

async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Delete session from database if present
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  await clearSession(reply);
  return reply.send({ success: true });
}

async function meHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, request.user.id))
    .limit(1);

  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }

  return reply.send(user);
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', loginHandler);
  app.get('/oidc/login', oidcLoginHandler);
  app.get('/oidc/callback', oidcCallbackHandler);
  app.post('/logout', logoutHandler);
  app.get('/me', { preHandler: [requireAuth] }, meHandler);
}
