import { Client as SSHClient } from 'ssh2';
import type { SFTPWrapper } from 'ssh2';
import { readFileSync } from 'node:fs';

interface HostConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string | null;
}

interface PoolEntry {
  client: SSHClient;
  sftp: SFTPWrapper;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

interface ManagerOptions {
  idleTimeoutMs?: number;
  connectTimeoutMs?: number;
}

export class SshConnectionManager {
  private pool = new Map<string, PoolEntry>();
  private connecting = new Map<string, Promise<SFTPWrapper>>();
  private idleTimeoutMs: number;
  private connectTimeoutMs: number;

  constructor(options: ManagerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  }

  get poolSize(): number {
    return this.pool.size;
  }

  async getSftp(config: HostConfig): Promise<SFTPWrapper> {
    const entry = this.pool.get(config.id);
    if (entry) {
      this.resetIdleTimer(config.id, entry);
      return entry.sftp;
    }

    const existing = this.connecting.get(config.id);
    if (existing) return existing;

    const promise = this.createConnection(config);
    this.connecting.set(config.id, promise);

    try {
      const sftp = await promise;
      return sftp;
    } finally {
      this.connecting.delete(config.id);
    }
  }

  private createConnection(config: HostConfig): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      const client = new SSHClient();

      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error(`SSH connection to ${config.host} timed out`));
      }, this.connectTimeoutMs);

      client.on('ready', () => {
        clearTimeout(timeout);
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            return reject(err);
          }

          const entry: PoolEntry = { client, sftp, idleTimer: null };
          this.pool.set(config.id, entry);
          this.resetIdleTimer(config.id, entry);

          client.on('close', () => {
            this.pool.delete(config.id);
          });

          client.on('error', () => {
            this.pool.delete(config.id);
          });

          resolve(sftp);
        });
      });

      client.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      let privateKey: Buffer | undefined;
      if (config.privateKeyPath) {
        try {
          privateKey = readFileSync(config.privateKeyPath);
        } catch {
          clearTimeout(timeout);
          reject(new Error(`Cannot read private key at ${config.privateKeyPath}`));
          return;
        }
      }

      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        ...(privateKey ? { privateKey } : {}),
        agent: !privateKey ? process.env.SSH_AUTH_SOCK : undefined,
        readyTimeout: this.connectTimeoutMs,
      });
    });
  }

  private resetIdleTimer(id: string, entry: PoolEntry): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      entry.client.end();
      this.pool.delete(id);
    }, this.idleTimeoutMs);
  }

  removeConnection(id: string): void {
    const entry = this.pool.get(id);
    if (entry) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.client.end();
      this.pool.delete(id);
    }
  }

  async closeAll(): Promise<void> {
    for (const [, entry] of this.pool) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.client.end();
    }
    this.pool.clear();
  }
}

export const sshConnectionManager = new SshConnectionManager();
