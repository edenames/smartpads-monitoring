import { test, expect } from '@playwright/test'

// Confirms the homepage is up, navigation renders, and the footer newsletter form is present.
// Failure here = site-wide issue or Webflow publish failure.
test('Homepage loads correctly', async ({ page }) => {
  await page.goto('https://www.smartpads.co')
  await expect(page).toHaveTitle(/SmartPads/i)
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('404')
  await expect(page.locator('body')).not.toContainText('Page Not Found')
  await expect(page.locator('#newsletter-sign-up-form')).toBeVisible()
})
