import { test, expect } from '@playwright/test'

// Confirms the Resources/blog page loads with content.
// 90+ articles live here — a blank page would indicate a CMS publish failure.
test('Resources page loads with content', async ({ page }) => {
  await page.goto('https://www.smartpads.co/resources')
  await expect(page.locator('body')).not.toContainText('404')
  await expect(page.locator('body')).not.toContainText('Page Not Found')
  // Article dates confirm CMS content is rendering (not just nav)
  await expect(page.locator('body')).toContainText('2025')
})
