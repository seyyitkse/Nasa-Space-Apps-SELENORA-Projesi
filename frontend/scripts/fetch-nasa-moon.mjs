#!/usr/bin/env node
/**
 * Installs NASA SVS 14959 Moon models (NASA GSFC SVS, LRO-derived) into public/nasa/svs-14959/
 * and verifies each SHA-256. The files are gitignored; the app shows an attributed static NASA
 * map until the default model is installed, and keeps "High" unavailable until --high is run.
 *
 *   npm run fetch:moon              # moon_small.glb (13.8 MB) — default globe
 *   npm run fetch:moon -- --high    # + Moon_NASA_LRO_8k_Topo_Small.glb (81.5 MB) — "High" tier
 *
 * Downloads use several parallel HTTP range requests (the NASA server is slow per connection)
 * and resume after interruptions.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/'
const ASSETS = {
  small: { file: 'moon_small.glb', bytes: 13_799_876, sha256: '12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4' },
  topo: { file: 'Moon_NASA_LRO_8k_Topo_Small.glb', bytes: 81_505_784, sha256: 'c4b65fb4df622a37fd75366c2ed9bf9e163e41c0fde178b3b27e31b0173e6953' },
}
const wanted = ['small', ...(process.argv.includes('--high') ? ['topo'] : [])]
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, '../public/nasa/svs-14959')
mkdirSync(dir, { recursive: true })
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

async function segment(url, file, start, end) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const have = existsSync(file) ? statSync(file).size : 0
    if (start + have > end) return
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start + have}-${end}` } })
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`)
      for await (const chunk of res.body) appendFileSync(file, chunk)
    } catch (e) {
      if (attempt === 30) throw e
    }
  }
}

for (const id of wanted) {
  const a = ASSETS[id]
  const dest = resolve(dir, a.file)
  if (existsSync(dest) && sha(dest) === a.sha256) {
    console.log(`✓ ${a.file} already installed and verified`)
    continue
  }
  const n = a.bytes > 30e6 ? 8 : 4
  const size = Math.ceil(a.bytes / n)
  console.log(`↓ ${a.file} (${(a.bytes / 1e6).toFixed(1)} MB, ${n} parallel ranges)`)
  const parts = Array.from({ length: n }, (_, i) => ({ file: `${dest}.part${i}`, start: i * size, end: Math.min(a.bytes, (i + 1) * size) - 1 }))
  const timer = setInterval(() => {
    const got = parts.reduce((s, p) => s + (existsSync(p.file) ? statSync(p.file).size : 0), 0)
    process.stdout.write(`\r  ${(got / 1e6).toFixed(1)} / ${(a.bytes / 1e6).toFixed(1)} MB`)
  }, 1000)
  await Promise.all(parts.map((p) => segment(BASE + a.file, p.file, p.start, p.end)))
  clearInterval(timer)
  process.stdout.write('\n')
  writeFileSync(`${dest}.tmp`, Buffer.concat(parts.map((p) => readFileSync(p.file))))
  parts.forEach((p) => rmSync(p.file))
  const got = sha(`${dest}.tmp`)
  if (got !== a.sha256) {
    rmSync(`${dest}.tmp`)
    console.error(`✗ ${a.file}: SHA-256 mismatch (${got}); removed — run again`)
    process.exit(1)
  }
  renameSync(`${dest}.tmp`, dest)
  console.log(`✓ ${a.file} installed and verified (SHA-256 ${a.sha256.slice(0, 12)}…)`)
}
