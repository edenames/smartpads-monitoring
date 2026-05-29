const fs = require('fs')
const https = require('https')

// What each check monitors and how to respond when it fails
const CHECK_CONTEXT = {
  '01-homepage': {
    name: 'Homepage',
    tier: 2,
    summary: 'The homepage is not loading correctly. This is typically a Webflow publish failure, CDN issue, or domain misconfiguration.',
    steps: [
      'Check Webflow status at webflowstatus.com',
      'Try the staging URL: smartpads-website.webflow.io',
      'Check domain settings in Webflow Dashboard → Hosting tab',
    ],
  },
  '02-start-here-quiz': {
    name: 'Start Here Quiz',
    tier: 2,
    summary: 'The quiz on the Start Here page is not loading. This usually means a quiz embed was accidentally removed or the page JS failed to load after a recent Webflow publish.',
    steps: [
      'Visit smartpads.co/start-here in an incognito window',
      'Open browser DevTools → Console — look for red errors',
      'In Webflow Designer, check the Start Here page for its three quiz embed blocks',
      'If a recent publish caused this, restore from Webflow Dashboard → Backups',
    ],
  },
  '03-contact-form': {
    name: 'Contact Form',
    tier: 2,
    summary: 'The contact form on the Contact Us page is missing or broken. This typically means a form embed was removed or the HubSpot script failed to load.',
    steps: [
      'Visit smartpads.co/contact-us in an incognito window',
      'Open browser DevTools → Console — look for red errors',
      'Log into HubSpot portal 43422805 → Forms to confirm forms are active',
      'Do not edit form embeds without a developer',
    ],
  },
  '04-design-catalog': {
    name: 'Design Catalog',
    tier: 1,
    summary: 'The design catalog page is not showing models. This is usually caused by CMS items being accidentally unpublished or a Webflow publish failure.',
    steps: [
      'Visit smartpads.co/design-catalog in an incognito window',
      'If models are missing: check Webflow CMS → Designs for any unpublished items',
      'If the page is blank: check Webflow publish status and republish',
    ],
  },
  '05-model-inquiry-modal': {
    name: 'Model Inquiry Modal',
    tier: 2,
    summary: 'The inquiry modal on the Trailhead model page is not opening. This could mean the page is unpublished, the inquiry button is missing, or the modal JavaScript is broken.',
    steps: [
      'Visit smartpads.co/designs/trailhead in an incognito window',
      'If page 404s: check Webflow CMS → Designs → confirm Trailhead is published',
      'If modal does not open: open DevTools → Console for errors — escalate to developer',
    ],
  },
  '06-resources': {
    name: 'Resources Page',
    tier: 1,
    summary: 'The Resources page is not showing articles. Blog posts may have been accidentally unpublished, or there was a Webflow publish failure.',
    steps: [
      'Visit smartpads.co/resources in an incognito window',
      'If articles are missing: check Webflow CMS → Resources for unpublished items',
      'If the page is blank: republish from Webflow',
    ],
  },
}

function getCheckKey(filePath) {
  const match = (filePath || '').match(/(\d+-[^/\\]+)\.spec\.ts/)
  return match ? match[1] : null
}

function collectFailures(suites) {
  const failures = []
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      const failed = spec.tests?.some(t =>
        t.results?.some(r => r.status === 'failed')
      )
      if (failed) {
        const checkKey = getCheckKey(suite.file || spec.file || '')
        failures.push({
          name: spec.title,
          checkKey,
          context: CHECK_CONTEXT[checkKey],
        })
      }
    }
    failures.push(...collectFailures(suite.suites))
  }
  return failures
}

async function createIssue(title, body) {
  const [owner, repo] = (process.env.REPO || '').split('/')
  const data = JSON.stringify({ title, body, labels: ['site-health'] })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'SmartPads-Monitor',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => resolve(JSON.parse(raw)))
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  const resultsPath = process.env.PLAYWRIGHT_RESULTS || 'results.json'
  if (!fs.existsSync(resultsPath)) {
    console.log('No results.json found — skipping diagnosis')
    return
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const failures = collectFailures(results.suites)

  if (failures.length === 0) {
    console.log('No failures found in results')
    return
  }

  const failedNames = failures.map(f => f.context?.name || f.name).join(', ')
  const runUrl = `https://github.com/${process.env.REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`

  const issueBody = `## What failed
${failures.map(f => `- **${f.context?.name || f.name}**`).join('\n')}

[View Actions run →](${runUrl})

---

## What's likely wrong

${failures.map(f => f.context?.summary || 'Unknown failure.').join('\n\n')}

---

## What to do

${failures
    .filter(f => f.context)
    .map(f => {
      const ctx = f.context
      const tierLabel = ctx.tier === 1 ? 'Team can fix' : 'Escalate to developer'
      return `### ${ctx.name} — Tier ${ctx.tier} (${tierLabel})\n${ctx.steps.map(s => `- ${s}`).join('\n')}`
    })
    .join('\n\n')}

---
*Close this issue once resolved.*`

  console.log('Creating GitHub issue...')
  const issue = await createIssue(
    `🚨 Site alert: ${failedNames} failing`,
    issueBody
  )
  console.log(`Issue created: ${issue.html_url}`)
}

main().catch(err => {
  console.error('Diagnosis script error:', err.message)
})
