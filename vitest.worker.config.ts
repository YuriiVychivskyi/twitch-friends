import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    include: ['worker/**/*.test.ts'],
    restoreMocks: true,
  },
});
