import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      reporter: ['lcov'],
      provider: 'v8',
    },
    fileParallelism: false,
    exclude: [
      'fixtures/*',
      'bin/*',
      'node_modules/*'
    ]
  },
})
