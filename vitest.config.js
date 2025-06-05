import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      reporter: ['lcov'],
      provider: 'v8',
      include: [
        'src/main.js'
      ]
    },
    fileParallelism: false,
  },
})
