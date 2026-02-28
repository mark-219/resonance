import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://seedbox:devpass@localhost:5432/resonance_test',
      SESSION_SECRET: 'test-session-secret-that-is-at-least-32-chars-long',
      LOG_LEVEL: 'error',
      LOCAL_AUTH_ENABLED: 'true',
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
