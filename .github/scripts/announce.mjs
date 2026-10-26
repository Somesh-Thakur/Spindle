// Posts a Spindle update to the Discord announcements channel.
//   node announce.mjs web       a new entry at the top of src/lib/changelog.json
//   node announce.mjs desktop   a new desktop release (desktop/release-notes.md)
// Needs DISCORD_ANNOUNCE_WEBHOOK; without it, it explains and exits quietly.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SITE = 'https://spindle-bice.vercel.app'
const RELEASES = 'https://github.com/Somesh-Thakur/Spindle/releases/latest'
const hook = process.env.DISCORD_ANNOUNCE_WEBHOOK
const kind = process.argv[2]
const force = process.env.FORCE === 'true'

if (!hook) {
  console.log('::notice::No DISCORD_ANNOUNCE_WEBHOOK secret, so nothing was posted. Add it under Settings → Secrets and variables → Actions.')
  process.exit(0)
}

let embed
if (kind === 'web') {
  const now = JSON.parse(readFileSync('src/lib/changelog.json', 'utf8'))[0]
  let before = null
  try {
    before = JSON.parse(execSync('git show HEAD~1:src/lib/changelog.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0]
  } catch {
    /* first version of the file */
  }
  if (!force && before?.version === now.version) {
    console.log(`Latest entry is still ${now.version}; nothing new to announce.`)
    process.exit(0)
  }
  embed = {
    title: `✨ What's new in Spindle: ${now.title}`,
    url: SITE,
    description: now.items.map((i) => `${i.emoji} ${i.text}`).join('\n\n') + `\n\n**[Open Spindle](${SITE})**`,
    color: 0xff3b5c,
    footer: { text: `Spindle ${now.version}` },
    timestamp: new Date().toISOString(),
  }
} else if (kind === 'desktop') {
  const version = JSON.parse(readFileSync('desktop/src-tauri/tauri.conf.json', 'utf8')).version
  // The notes without the install instructions at the end.
  const notes = readFileSync('desktop/release-notes.md', 'utf8').split(/\n\s*Already have Spindle\?/)[0].trim()
  embed = {
    title: `💻 Spindle for desktop ${version} is out`,
    url: RELEASES,
    description: `${notes}\n\nAlready installed? Spindle updates itself: click **Update now** when the card appears.\n**[Download for Windows or Mac](${RELEASES})**`,
    color: 0x7a5cff,
    timestamp: new Date().toISOString(),
  }
} else {
  console.error('Say "web" or "desktop".')
  process.exit(1)
}

const res = await fetch(hook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'Spindle', avatar_url: `${SITE}/brand/spindle-icon-512.png`, embeds: [embed] }),
})
if (!res.ok) {
  console.error(`::error::Discord said ${res.status}: ${await res.text()}`)
  process.exit(1)
}
console.log(`Announced: ${embed.title}`)
