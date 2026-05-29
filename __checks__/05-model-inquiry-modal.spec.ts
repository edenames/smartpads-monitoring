import { test, expect } from '@playwright/test'

// Confirms a model detail page loads and the inquiry modal opens when triggered.
// Uses the Trailhead page as the stable test target.
// Failure here = model page 404, [data-sm-open] button missing, or modal JS broken.
test('Model inquiry modal opens on Trailhead page', async ({ page }) => {
  await page.goto('https://www.smartpads.co/designs/trailhead')
  await expect(page.locator('body')).not.toContainText('404')
  await expect(page.locator('body')).toContainText('Trailhead')

  const inquireBtn = page.locator('[data-sm-open]').first()
  await expect(inquireBtn).toBeVisible({ timeout: 10000 })
  await inquireBtn.click()

  await expect(page.locator('#form-modal-overlay')).toBeVisible({ timeout: 5000 })
})
