// Runs the Tauri CLI for the release workflow. If the build fails, the end of
// its output becomes a GitHub error note, which anyone can read on the run page
// (full logs need a GitHub login).
import { spawn } from 'node:child_process'

const tail = []
const keep = (chunk) => {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line.trim()) continue
    tail.push(line.replace(/\x1b\[[0-9;]*m/g, ''))
    if (tail.length > 60) tail.shift()
  }
}

const child = spawn('npx', ['tauri', ...process.argv.slice(2)], { shell: true })
child.stdout.on('data', (d) => (process.stdout.write(d), keep(d)))
child.stderr.on('data', (d) => (process.stderr.write(d), keep(d)))
child.on('close', (code) => {
  if (code) {
    const msg = tail.join('\n').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    console.log(`::error title=Desktop build failed::${msg}`)
  }
  process.exit(code ?? 1)
})
