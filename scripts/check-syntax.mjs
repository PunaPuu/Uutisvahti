// Syntax check for every project JS file (node --check). Cross-platform.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const DIRS = ['src', 'scripts', 'test', 'public']
const files = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(mjs|js)$/.test(n)) files.push(p)
  }
}
for (const d of DIRS) walk(d)

let bad = 0
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) { bad++; process.stderr.write(r.stderr) }
}
console.log(`node --check: ${files.length - bad}/${files.length} files OK`)
process.exit(bad ? 1 : 0)
