const fs = require('fs')
const https = require('https')

// What each check monitors and how to respond when it fails
const CHECK_CONTEXT = {
  '01-homepage': {
    name: 'Homepage',
    tier: 2,
    causes: 'Webflow publish failure, CDN issue, or domain misconfiguration',
    steps: [
      'Check Webflow status at webflowstatus.com',
      'Try the staging URL: smartpads-website.webflow.io',
      'Check domain settings in Webflow Dashboard → Hosting tab',
    ],
  },
  '02-start-here-quiz': {
    name: 'Start Here Quiz',
    tier: 2,
    causes: 'Quiz embed accidentally removed or JS failed to load after a Webflow publish',
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
    causes: 'Form embed removed, field IDs changed, or HubSpot script failed to load',
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
    causes: 'CMS items accidentally unpublished, or Webflow publish failure',
    steps: [
      'Visit smartpads.co/design-catalog in an incognito window',
      'If models are missing: check Webflow CMS → Designs for any unpublished items',
      'If the page is blank: check Webflow publish status and republish',
    ],
  },
  '05-model-inquiry-modal': {
    name: 'Model Inquiry Modal',
    tier: 2,
    causes: 'Modal JS broken, inquiry button missing, or Trailhead page unpublished',
    steps: [
      'Visit smartpads.co/designs/trailhead in an incognito window',
      'If page 404s: check Webflow CMS → Designs → confirm Trailhead is published',
      'If modal does not open: open DevTools → Console for errors — escalate to developer',
    ],
  },
  '06-resources': {
    name: 'Resources Page',
    tier: 1,
    causes: 'Blog posts accidentally unpublished, or Webflow publish failure',
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
        const errorMessage =
          spec.tests?.[0]?.results?.find(r => r.status === 'failed')?.error?.message || 'Unknown error'
        const checkKey = getCheckKey(suite.file || spec.file || '')
        failures.push({
          name: spec.title,
          checkKey,
          context: CHECK_CONTEXT[checkKey],
          error: errorMessage.substring(0, 400),
        })
      }
    }
    failures.push(...collectFailures(suite.suites))
  }
  return failures
}

function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(data) } },
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

async function callClaude(prompt) {
  const result = await post(
    'api.anthropic.com',
    '/v1/messages',
    {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }
  )
  return result.content?.[0]?.text || 'Diagnosis unavailable.'
}

async function createIssue(title, body) {
  const [owner, repo] = (process.env.REPO || '').split('/')
  return post(
    'api.github.com',
    `/repos/${owner}/${repo}/issues`,
    {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'SmartPads-Monitor',
      'content-type': 'application/json',
    },
    { title, body, labels: ['site-health'] }
  )
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

  const failureList = failures
    .map(f => {
      const ctx = f.context
      return [
        `**Check:** ${ctx?.name || f.name}`,
        `**Error:** ${f.error}`,
        `**Likely cause:** ${ctx?.causes || 'Unknown'}`,
      ].join('\n')
    })
    .join('\n\n')

  const prompt = `You are a site monitoring assistant for SmartPads (smartpads.co), a modular home builder on Webflow with custom HubSpot forms.

These health checks just failed:

${failureList}

Write a 3–5 sentence plain-English summary for a non-technical team member explaining what is likely broken and what to do first. Do not use jargon. Be specific and direct.`

  console.log('Calling Claude for diagnosis...')
  const diagnosis = await callClaude(prompt)

  const failedNames = failures.map(f => f.context?.name || f.name).join(', ')
  const runUrl = `https://github.com/${process.env.REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`

  const issueBody = `## What failed
${failures.map(f => `- **${f.context?.name || f.name}** (${f.name})`).join('\n')}

[View Actions run](${runUrl})

---

## What's likely wrong

${diagnosis}

---

## What to do

${failures
  .filter(f => f.context)
  .map(f => {
    const ctx = f.context
    return `### ${ctx.name} — Tier ${ctx.tier}${ctx.tier === 1 ? ' (team can fix)' : ' (escalate to developer)'}\n${ctx.steps.map(s => `- ${s}`).join('\n')}`
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
  // Don't exit 1 — let the workflow failure speak for itself
})
