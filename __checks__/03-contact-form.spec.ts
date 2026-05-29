import { test, expect } from '@playwright/test'

// Confirms all contact form fields and the submit button are present and interactive.
// Form submits directly to HubSpot portal 43422805 via custom JS — not Webflow's native forms.
// Failure here = embed removed, form IDs changed, or HubSpot script failed to load.
test('Contact form is present and interactive', async ({ page }) => {
  await page.goto('https://www.smartpads.co/contact-us')
  await expect(page.locator('#email-form')).toBeVisible()
  await expect(page.locator('#First-Name')).toBeVisible()
  await expect(page.locator('#Last-Name')).toBeVisible()
  await expect(page.locator('#Email')).toBeVisible()
  await expect(page.locator('#Comments')).toBeVisible()
  await expect(page.locator('#submit-btn')).toBeVisible()
  await page.locator('#First-Name').fill('MonitorTest')
  await expect(page.locator('#First-Name')).toHaveValue('MonitorTest')
})
