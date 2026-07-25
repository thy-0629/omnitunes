import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Co-locate unit tests alongside source or in test/unit/
    include: ['test/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/smoke.ts', 'src/db/migrate.ts'],
      reporter: ['text', 'html'],
    },
  },
});
