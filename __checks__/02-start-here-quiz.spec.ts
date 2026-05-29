import { test, expect } from '@playwright/test'

// Confirms the Start Here quiz loads and its container is present.
// The quiz is split across three Webflow embeds — if any are missing, #sp-quiz won't render.
// Failure here = quiz embed removed or JS failed to load.
test('Start Here quiz loads', async ({ page }) => {
  await page.goto('https://www.smartpads.co/start-here')
  await expect(page.locator('body')).not.toContainText('404')
  await expect(page.locator('#sp-quiz')).toBeVisible({ timeout: 15000 })
})
