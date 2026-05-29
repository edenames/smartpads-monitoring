import { test, expect } from '@playwright/test'

// Confirms the design catalog page loads and model content is rendered.
// Catalog uses custom JS for filtering and compare mode — a blank or broken page
// would indicate a Webflow publish issue or the catalog embed failing.
test('Design catalog loads with models', async ({ page }) => {
  await page.goto('https://www.smartpads.co/design-catalog')
  await expect(page.locator('body')).not.toContainText('404')
  await expect(page.locator('body')).toContainText('Ascent')
  await expect(page.locator('body')).toContainText('Basecamp')
  await expect(page.locator('body')).toContainText('Summit')
})
