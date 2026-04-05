import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    expect: {
      requireAssertions: true,
    },
    restoreMocks: true,
    clearMocks: true,
    threads: false,
    execArgv: ['--disable-warning=DEP0040', '--disable-warning=DEP0190', '--disable-warning=ExperimentalWarning'],
  },
});
