import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Include patterns
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],

    // Timeout for async operations
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 30000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**'],
    },

    // Globals
    globals: true,

    // Reporter
    reporters: ['verbose'],

    // Environment variables for integration tests
    env: {
      BITSAGE_API_URL: 'http://localhost:8080',
      BITSAGE_NETWORK: 'sepolia',
    },
  },
});
