import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────

interface ScanProgressEvent {
  type: 'scan_progress';
  jobId: string;
  libraryId: string;
  progress: number;
  totalItems: number;
  currentItem?: string;
}

interface ScanCompleteEvent {
  type: 'scan_complete';
  jobId: string;
  libraryId: string;
  totalScanned: number;
}

interface NotificationEvent {
  type: 'notification';
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
}

type Event = ScanProgressEvent | ScanCompleteEvent | NotificationEvent;

// ─── SSE Manager ──────────────────────────────────────────────────────

class SSEManager {
  private clients = new Map<string, FastifyReply>();

  addClient(userId: string, reply: FastifyReply): void {
    this.clients.set(`${userId}-${Date.now()}`, reply);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  broadcast(event: Event): void {
    const data = JSON.stringify(event);

    for (const [, reply] of this.clients) {
      if (!reply.sent) {
        reply.raw.write(`data: ${data}\n\n`);
      }
    }
  }

  sendToUser(userId: string, event: Event): void {
    const data = JSON.stringify(event);

    for (const [clientId, reply] of this.clients) {
      if (clientId.startsWith(userId) && !reply.sent) {
        reply.raw.write(`data: ${data}\n\n`);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

const sseManager = new SSEManager();

// ─── Route handlers ──────────────────────────────────────────────────

async function eventsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.id;

  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': config.CORS_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers':
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  });

  // Send initial connection message
  reply.raw.write(': SSE connection established\n\n');

  // Add client to manager
  const clientId = `${userId}-${Date.now()}`;
  sseManager.addClient(userId, reply);

  // Handle client disconnect
  reply.raw.on('close', () => {
    sseManager.removeClient(clientId);
    request.log.info(`SSE client disconnected: ${clientId}`);
  });

  request.log.info(`SSE client connected: ${clientId}`);

  // Keep connection alive with heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (!reply.sent) {
      reply.raw.write(': heartbeat\n\n');
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Ensure cleanup on finish
  reply.raw.on('finish', () => {
    clearInterval(heartbeatInterval);
  });
}

// ─── Utility functions for event emission ────────────────────────────

/**
 * Emit scan progress event to a user
 */
export function emitScanProgress(
  userId: string,
  jobId: string,
  libraryId: string,
  progress: number,
  totalItems: number,
  currentItem?: string
): void {
  const event: ScanProgressEvent = {
    type: 'scan_progress',
    jobId,
    libraryId,
    progress,
    totalItems,
    currentItem,
  };

  sseManager.sendToUser(userId, event);
}

/**
 * Emit scan complete event to a user
 */
export function emitScanComplete(
  userId: string,
  jobId: string,
  libraryId: string,
  totalScanned: number
): void {
  const event: ScanCompleteEvent = {
    type: 'scan_complete',
    jobId,
    libraryId,
    totalScanned,
  };

  sseManager.sendToUser(userId, event);
}

/**
 * Emit notification event to a user
 */
export function emitNotification(
  userId: string,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'error' | 'success' = 'info'
): void {
  const event: NotificationEvent = {
    type: 'notification',
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    message,
    severity,
    timestamp: new Date().toISOString(),
  };

  sseManager.sendToUser(userId, event);
}

/**
 * Broadcast event to all connected clients
 */
export function broadcastEvent(event: Event): void {
  sseManager.broadcast(event);
}

/**
 * Get current number of connected SSE clients
 */
export function getConnectedClientsCount(): number {
  return sseManager.getClientCount();
}

// ─── Plugin ───────────────────────────────────────────────────────────

export async function eventsRoutes(app: FastifyInstance) {
  // Server-Sent Events endpoint
  app.get('/', { preHandler: [requireAuth] }, eventsHandler);
}

// Export SSE manager for use in other modules
export { sseManager, SSEManager };
