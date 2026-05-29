import { defineConfig } from '@playwright/test'

export default defineConfig({
  timeout: 30000,
  reporter: [
    ['list'],
    ['github'],
    ['json', { outputFile: 'results.json' }],
  ],
  use: {
    headless: true,
  },
})
