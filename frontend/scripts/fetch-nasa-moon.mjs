#!/usr/bin/env node
/**
 * Downloads NASA SVS 14959 "moon_small.glb" (13.8 MB, NASA GSFC SVS, LRO-derived) into
 * public/nasa/svs-14959/ and verifies its SHA-256. The file is gitignored; the app shows
 * an attributed static NASA map until it is installed.
 *
 *   npm run fetch:moon
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb'
const BYTES = 13_799_876
const SHA256 = '12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4'
const here = dirname(fileURLToPath(import.meta.url))
const dest = resolve(here, '../public/nasa/svs-14959/moon_small.glb')
const part = `${dest}.part`

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

if (existsSync(dest) && sha(dest) === SHA256) {
  console.log(`✓ already installed and verified: ${dest}`)
  process.exit(0)
}
mkdirSync(dirname(dest), { recursive: true })

for (let attempt = 1; attempt <= 8; attempt++) {
  const have = existsSync(part) ? statSync(part).size : 0
  if (have >= BYTES) break
  process.stdout.write(`↓ ${SRC} (attempt ${attempt}, resume at ${(have / 1e6).toFixed(1)} MB)\n`)
  try {
    const res = await fetch(SRC, { headers: have ? { Range: `bytes=${have}-` } : {} })
    if (!(res.ok || res.status === 206)) throw new Error(`HTTP ${res.status}`)
    const out = createWriteStream(part, { flags: have && res.status === 206 ? 'a' : 'w' })
    let n = res.status === 206 ? have : 0
    for await (const chunk of res.body) {
      out.write(chunk)
      n += chunk.length
      process.stdout.write(`\r  ${(n / 1e6).toFixed(1)} / ${(BYTES / 1e6).toFixed(1)} MB`)
    }
    await new Promise((r) => out.end(r))
    process.stdout.write('\n')
  } catch (e) {
    console.warn(`  interrupted: ${e.message}`)
  }
}
if (!existsSync(part) || statSync(part).size !== BYTES) {
  console.error('✗ download incomplete; run again to resume')
  process.exit(1)
}
const got = sha(part)
if (got !== SHA256) {
  unlinkSync(part)
  console.error(`✗ SHA-256 mismatch (${got}); file removed`)
  process.exit(1)
}
renameSync(part, dest)
console.log(`✓ installed and verified (SHA-256 ${SHA256.slice(0, 12)}…): ${dest}`)
