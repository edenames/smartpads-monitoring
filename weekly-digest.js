const https = require('https')

async function sendEmail(subject, text) {
  const emails = (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
  if (!emails.length || !process.env.RESEND_API_KEY) return

  const data = JSON.stringify({
    from: 'SmartPads Monitoring <onboarding@resend.dev>',
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
            console.log(`Digest email sent: ${parsed.id}`)
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

function githubGet(path) {
  const [owner, repo] = (process.env.REPO || '').split('/')
  const fullPath = path.replace('{owner}', owner).replace('{repo}', repo)

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: fullPath,
        method: 'GET',
        headers: {
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'SmartPads-Monitor',
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => resolve(JSON.parse(raw)))
      }
    )
    req.on('error', reject)
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
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  const allIssues = await githubGet(
    `/repos/{owner}/{repo}/issues?labels=site-health&state=all&since=${since}&per_page=50`
  )

  // Exclude digest issues themselves to avoid counting last week's digest
  const incidents = allIssues.filter(
    i => !i.title.toLowerCase().includes('weekly') && !i.title.includes('📊')
  )

  const open = incidents.filter(i => i.state === 'open')
  const resolved = incidents.filter(i => i.state === 'closed')

  let title, body

  if (incidents.length === 0) {
    title = `✅ Weekly digest — ${weekLabel} — no incidents`
    body = `## ✅ No incidents this week

All automated checks passed throughout the past 7 days. No action needed.

---
Checks run every 30 minutes via [GitHub Actions](https://github.com/${process.env.REPO}/actions/workflows/monitoring.yml).
[View playbook](https://github.com/${process.env.REPO}/blob/main/PLAYBOOK.md)`
  } else {
    const statusEmoji = open.length > 0 ? '🔴' : '🟡'
    title = `${statusEmoji} Weekly digest — ${weekLabel} — ${incidents.length} incident${incidents.length > 1 ? 's' : ''}`

    body = `## Site health summary — week of ${weekLabel}\n\n`

    if (open.length > 0) {
      body += `### 🔴 Still open — action needed (${open.length})\n`
      body += open
        .map(i => `- [${i.title}](${i.html_url}) — opened ${new Date(i.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
        .join('\n')
      body += '\n\n'
    }

    if (resolved.length > 0) {
      body += `### ✅ Resolved this week (${resolved.length})\n`
      body += resolved
        .map(i => `- [${i.title}](${i.html_url}) — resolved ${new Date(i.closed_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
        .join('\n')
      body += '\n'
    }

    body += `\n---\n[View playbook](https://github.com/${process.env.REPO}/blob/main/PLAYBOOK.md)`
  }

  const issue = await createIssue(title, body)
  console.log(`Weekly digest created: ${issue.html_url}`)

  const openCount = incidents.filter(i => i.state === 'open').length
  const emailText = incidents.length === 0
    ? `All automated checks passed this week. No incidents.\n\n${issue.html_url}`
    : `${openCount > 0 ? `${openCount} incident(s) still open — action needed.` : 'All incidents resolved.'}\n\nFull summary: ${issue.html_url}`

  await sendEmail(title, emailText)
}

main().catch(err => {
  console.error('Weekly digest error:', err.message)
  process.exit(1)
})
