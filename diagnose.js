const fs = require('fs')
const https = require('https')

const PLAYBOOK_BASE = 'https://github.com/edenames/smartpads-monitoring/blob/main/PLAYBOOK.md'

// What each check monitors and how to respond when it fails
const CHECK_CONTEXT = {
  '01-homepage': {
    name: 'Homepage',
    tier: 2,
    playbookUrl: `${PLAYBOOK_BASE}#homepage-not-loading`,
    steps: [
      'Check Webflow status at webflowstatus.com',
      'Try the staging URL: smartpads-website.webflow.io',
      'Check domain settings in Webflow Dashboard → Hosting tab',
    ],
  },
  '02-start-here-quiz': {
    name: 'Start Here Quiz',
    tier: 2,
    playbookUrl: `${PLAYBOOK_BASE}#start-here-quiz-not-loading`,
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
    playbookUrl: `${PLAYBOOK_BASE}#contact-form-broken`,
    steps: [
      'Visit smartpads.co/contact-us in an incognito window',
      'Open browser DevTools → Console — look for red errors',
      'Log into HubSpot → Forms to confirm forms are active',
      'Do not edit form embeds without a developer',
    ],
  },
  '04-design-catalog': {
    name: 'Design Catalog',
    tier: 1,
    playbookUrl: `${PLAYBOOK_BASE}#design-catalog-not-showing-models`,
    steps: [
      'Visit smartpads.co/design-catalog in an incognito window',
      'If models are missing: check Webflow CMS → Designs for any unpublished items',
      'If the page is blank: check Webflow publish status and republish',
    ],
  },
  '05-model-inquiry-modal': {
    name: 'Model Inquiry Modal',
    tier: 2,
    playbookUrl: `${PLAYBOOK_BASE}#model-inquiry-modal-not-opening`,
    steps: [
      'Visit smartpads.co/designs/trailhead in an incognito window',
      'If page 404s: check Webflow CMS → Designs → confirm Trailhead is published',
      'If modal does not open: open DevTools → Console for errors — escalate to developer',
    ],
  },
  '06-resources': {
    name: 'Resources Page',
    tier: 1,
    playbookUrl: `${PLAYBOOK_BASE}#resources-page-not-showing-articles`,
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
        const errorMessage =
          spec.tests?.[0]?.results?.find(r => r.status === 'failed')?.error?.message || 'unknown error'
        failures.push({
          name: spec.title,
          checkKey,
          context: CHECK_CONTEXT[checkKey],
          error: errorMessage.substring(0, 300),
        })
      }
    }
    failures.push(...collectFailures(suite.suites))
  }
  return failures
}

async function fetchUptimeRobotStatus() {
  if (!process.env.UPTIMEROBOT_API_KEY) return null

  const body = `api_key=${process.env.UPTIMEROBOT_API_KEY}&format=json`

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.uptimerobot.com',
        path: '/v2/getMonitors',
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw)
            resolve(parsed.monitors || null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.write(body)
    req.end()
  })
}

function formatMonitorStatus(status) {
  if (status === 2) return '✅ Up'
  if (status === 8) return '⚠️ Seems down'
  if (status === 9) return '🔴 Down'
  return '❓ Unknown'
}

async function callClaude(prompt) {
  const data = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          const parsed = JSON.parse(raw)
          resolve(parsed.content?.[0]?.text || 'Diagnosis unavailable.')
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function sendEmail(subject, text) {
  const emails = (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
  if (!emails.length || !process.env.RESEND_API_KEY) return

  const data = JSON.stringify({
    from: 'SmartPads Monitoring <alerts@smartpads.co>',
    to: emails,
    subject,
    text,
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          const parsed = JSON.parse(raw)
          if (parsed.id) {
            console.log(`Alert email sent: ${parsed.id}`)
          } else {
            console.error('Resend error:', JSON.stringify(parsed))
          }
          resolve()
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
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

  const monitors = await fetchUptimeRobotStatus()
  const uptimeSection = monitors
    ? `## UptimeRobot Status\n${monitors.map(m => `- **${m.friendly_name}** — ${formatMonitorStatus(m.status)}`).join('\n')}`
    : null

  const uptimeContext = monitors
    ? `UptimeRobot monitor status at time of failure:\n${monitors.map(m => `${m.friendly_name}: ${formatMonitorStatus(m.status)}`).join('\n')}`
    : ''

  const failureDetail = failures.map(f => {
    const ctx = f.context
    return [
      `Check: ${ctx?.name || f.name}`,
      `Error: ${f.error || 'unknown'}`,
      `Typical cause: ${ctx?.summary || 'unknown'}`,
    ].join('\n')
  }).join('\n\n')

  const prompt = `You are a site monitoring assistant for SmartPads (smartpads.co), a modular home builder on Webflow CMS with custom HubSpot forms.

These health checks just failed:

${failureDetail}

${uptimeContext}

Write 2-4 sentences in plain English for a non-technical team member. Based on the specific error message, explain what is most likely broken right now and whether the team should try to fix it themselves or escalate immediately. Be specific — distinguish between "page didn't load at all" vs "element was missing" vs "timed out" where it matters. If UptimeRobot shows the site is up, note it's likely a page-level issue not a full outage. No jargon.`

  console.log('Calling Claude for diagnosis...')
  const diagnosis = await callClaude(prompt)

  const issueBody = `## What failed
${failures.map(f => `- **${f.context?.name || f.name}**`).join('\n')}

[View Actions run →](${runUrl})

---

${uptimeSection ? uptimeSection + '\n\n---\n\n' : ''}## What's likely wrong

${diagnosis}

---

## What to do

${failures
    .filter(f => f.context)
    .map(f => {
      const ctx = f.context
      const tierLabel = ctx.tier === 1 ? 'Team can fix' : 'Escalate to developer'
      return `### ${ctx.name} — Tier ${ctx.tier} (${tierLabel})\n${ctx.steps.map(s => `- ${s}`).join('\n')}\n\n[Full playbook steps →](${ctx.playbookUrl})`
    })
    .join('\n\n')}

---
*Close this issue once resolved.*`

  const issueTitle = `🚨 Site alert: ${failedNames} failing`

  console.log('Creating GitHub issue...')
  const issue = await createIssue(issueTitle, issueBody)
  console.log(`Issue created: ${issue.html_url}`)

  const emailText = [
    `What failed: ${failedNames}`,
    '',
    diagnosis,
    '',
    `Status page: https://stats.uptimerobot.com/vdK5EDddOX`,
    `View full details and steps: ${issue.html_url}`,
  ].join('\n')

  await sendEmail(issueTitle, emailText)
}

main().catch(err => {
  console.error('Diagnosis script error:', err.message)
})
