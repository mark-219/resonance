import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SshConnectionManager } from '../../services/sshConnectionManager.js';

vi.mock('ssh2', () => {
  const mockSftp = {
    stat: vi.fn(),
    createReadStream: vi.fn(),
  };

  class MockClient {
    private handlers: Record<string, Function[]> = {};

    on(event: string, handler: Function) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);
      return this;
    }

    connect(_config: unknown) {
      setTimeout(() => {
        this.handlers['ready']?.forEach((h) => h());
      }, 0);
    }

    sftp(cb: (err: Error | null, sftp: unknown) => void) {
      cb(null, mockSftp);
    }

    end() {}
    destroy() {}
  }

  return { Client: MockClient };
});

describe('SshConnectionManager', () => {
  let manager: SshConnectionManager;

  beforeEach(() => {
    manager = new SshConnectionManager({ idleTimeoutMs: 100 });
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  it('creates a new connection for unknown host', async () => {
    const sftp = await manager.getSftp({
      id: 'host-1',
      host: 'example.com',
      port: 22,
      username: 'user',
    });

    expect(sftp).toBeDefined();
    expect(sftp.stat).toBeDefined();
  });

  it('reuses existing connection for same host', async () => {
    const hostConfig = {
      id: 'host-1',
      host: 'example.com',
      port: 22,
      username: 'user',
    };

    const sftp1 = await manager.getSftp(hostConfig);
    const sftp2 = await manager.getSftp(hostConfig);

    expect(sftp1).toBe(sftp2);
  });

  it('creates separate connections for different hosts', async () => {
    await manager.getSftp({
      id: 'host-1',
      host: 'example1.com',
      port: 22,
      username: 'user',
    });

    await manager.getSftp({
      id: 'host-2',
      host: 'example2.com',
      port: 22,
      username: 'user',
    });

    expect(manager.poolSize).toBe(2);
  });

  it('closeAll removes all connections', async () => {
    await manager.getSftp({
      id: 'host-1',
      host: 'example.com',
      port: 22,
      username: 'user',
    });

    expect(manager.poolSize).toBe(1);
    await manager.closeAll();
    expect(manager.poolSize).toBe(0);
  });
});
