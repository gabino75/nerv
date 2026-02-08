import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/shared/**/*.ts', 'src/main/utils.ts'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
    },
  },
})
