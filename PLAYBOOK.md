# SmartPads Site Health Playbook

When you receive a site alert email, use this document to figure out what to do.

**Status page:** [status.smartpads.co](https://status.smartpads.co) — check this first to see what's currently down.

---

## How alerts work

When an automated check fails, you'll receive an email with:
- **What failed** — which part of the site is broken
- **What's likely wrong** — a plain-English explanation based on the specific error
- **What to do** — the steps below, linked directly

Alerts fire within 30 minutes of a problem starting. You'll get a second email when the issue resolves.

---

## Tier 1 — Team can fix

These issues don't require a developer.

### Design Catalog not showing models

The catalog page isn't displaying home models. Usually means CMS items were accidentally unpublished.

1. Visit [smartpads.co/design-catalog](https://smartpads.co/design-catalog) in an incognito window to confirm
2. Log into [Webflow CMS](https://smartpads-website.design.webflow.com/?workflow=cms) → **Designs**
3. Look for any items in Draft status — click to open and set to Published
4. Click **Publish** in the top right
5. Reload the catalog page to confirm models appear
6. Close the GitHub issue once resolved

### Resources page not showing articles

The blog/resources page is missing articles.

1. Visit [smartpads.co/resources](https://smartpads.co/resources) in incognito to confirm
2. Log into Webflow CMS → **Resources**
3. Look for any items accidentally set to Draft — publish them
4. If the whole page is blank (not just missing articles), escalate to developer

---

## Tier 2 — Escalate to developer

Do not attempt to fix these yourself. Confirm the issue is real, then contact the developer.

### Homepage not loading

The main site is unreachable or returning an error.

1. Try [smartpads.co](https://smartpads.co) in an incognito window
2. Try the staging URL: [smartpads-website.webflow.io](https://smartpads-website.webflow.io)
   - If staging works but the main site doesn't: domain/DNS issue — escalate immediately
   - If both are down: Webflow outage — check [webflowstatus.com](https://webflowstatus.com) and wait
3. Escalate to developer with what you found

### Start Here quiz not loading

The quiz on the Start Here page isn't appearing.

1. Visit [smartpads.co/start-here](https://smartpads.co/start-here) in incognito to confirm
2. Note whether the page loads at all, or just the quiz section is missing
3. **Do not edit any embed blocks in Webflow Designer** — escalate to developer
4. If a Webflow publish happened recently, mention that when you escalate

### Contact form broken

The contact form on the Contact Us page is missing or not submitting.

1. Visit [smartpads.co/contact-us](https://smartpads.co/contact-us) in incognito to confirm
2. Note what's broken — form missing entirely, or submit button not working
3. **Do not edit form embeds** — escalate to developer
4. Log into HubSpot → **Forms** and check if forms show as active

### Model inquiry modal not opening

The "Inquire" button on model pages isn't opening the request form.

1. Visit [smartpads.co/designs/trailhead](https://smartpads.co/designs/trailhead) in incognito
2. If the page 404s: log into Webflow CMS → Designs → check that Trailhead is Published
3. If the page loads but the modal doesn't open: **escalate to developer** — do not touch the form embeds

---

## Closing an incident

Once the issue is resolved:
1. Verify the fix by visiting the affected page in an incognito window
2. Trigger a manual check: [Actions → SmartPads Site Health → Run workflow](https://github.com/edenames/smartpads-monitoring/actions/workflows/monitoring.yml)
3. Confirm it passes (green checkmark)
4. Close the GitHub issue and add a brief note on what the fix was

---

## Still not sure?

Contact the developer. When you reach out, include:
- The alert email you received
- What you saw when you visited the page
- Whether a recent Webflow publish happened before the alert
