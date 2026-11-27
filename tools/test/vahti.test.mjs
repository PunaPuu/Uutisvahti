// SecurityScannerAppin vahti on repon yhteisessä hakemistossa .git/hooks, joten
// projektin hookien pitää löytää se myös linkitetystä työpuusta (git worktree).
// Testit ajavat oikeaa .githooks/yhteiset.sh-tiedostoa väliaikaisessa repossa.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'

const yhteiset = resolve(import.meta.dirname, '..', '..', '.githooks', 'yhteiset.sh')
const VAHTI = '# SecurityScannerApp git guard (testi)'
const at = '@'

// Git for Windows ei lisää sh:ta PATHiin, vaikka git-hookit käyttävät sitä. Sen
// bin-kansion sh.exe lisää gitin omat työkalut (grep) itse PATHiin.
const shGitKansiosta = (execPath) => join(execPath, '..', '..', '..', 'bin', 'sh.exe')
const sh = () => (process.platform === 'win32' ? shGitKansiosta(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()) : 'sh')

describe('SecurityScannerAppin vahti ja työpuut', () => {
  let repo
  let tyopuu
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Testi', '-c', `user.email=testi${at}example.test`, ...args], { cwd: repo, encoding: 'utf8', stdio: 'pipe' })
  const ketjuta = (kansio) => spawnSync(sh(), ['-c', `. "${yhteiset}"; ketjuta_skanneriin pre-commit; echo LOPPU`], { cwd: kansio, encoding: 'utf8' })
  const asennaVahti = (loppu) => writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\n${VAHTI}\necho VAHTI-AJETTU\n${loppu}\n`)

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'turvavahti-')))
    tyopuu = `${repo}-tyopuu`
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'ensimmäinen')
    git('worktree', 'add', '-q', '-b', 'tyo', tyopuu)
  })
  after(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(tyopuu, { recursive: true, force: true })
  })

  test('sh löytyy gitin omasta kansiosta', () => {
    assert.equal(shGitKansiosta('/ohjelmat/Git/mingw64/libexec/git-core'), join('/ohjelmat/Git/bin/sh.exe'))
  })

  test('vahti ajetaan pääkansiossa', () => {
    asennaVahti('exit 0')
    const r = ketjuta(repo)
    assert.match(r.stdout, /VAHTI-AJETTU/)
    assert.match(r.stdout, /LOPPU/)
  })

  test('vahti ajetaan linkitetyssä työpuussa', () => {
    asennaVahti('exit 0')
    const r = ketjuta(tyopuu)
    assert.match(r.stdout, /VAHTI-AJETTU/)
    assert.doesNotMatch(r.stderr, /ei ole asennettu/)
  })

  test('vahdin esto pysäyttää commitin myös työpuussa', () => {
    asennaVahti('exit 1')
    const r = ketjuta(tyopuu)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /vahti esti commitin/)
    assert.doesNotMatch(r.stdout, /LOPPU/)
  })

  test('puuttuvasta vahdista varoitetaan työpuussa', () => {
    rmSync(join(repo, '.git', 'hooks', 'pre-commit'), { force: true })
    const r = ketjuta(tyopuu)
    assert.equal(r.status, 0)
    assert.match(r.stderr, /ei ole asennettu/)
  })
})
