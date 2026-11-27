// Clauden PreToolUse-hookin testit: ajetaan oikeaa hookia samalla syötteellä,
// jonka Claude Code sille antaa. Koodi 2 tarkoittaa, että kutsu estetään.
//
// Hook ajetaan väliaikaisessa kopiossa kiinteillä asetuksilla, joten testit
// todistavat vahdin toiminnan riippumatta projektin omista valinnoista.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const juuri = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = '@'
const HETU = '131052' + '-308T'
const OAUTH = 'GOCSPX' + '-' + 'Qk3vT9xZp2LmN8wR4yB7cH1dF6gJ'

const asetukset = (muutokset = '') => `export const PROJEKTI = {
  etarepoSallittu: false,
  henkilotiedot: { henkilotunnus: true, sahkoposti: true, puhelinnumero: true, lisamallit: [] },
  sallitutDomainit: [], sallitutKuvakansiot: [], kielletytNimet: [], kielletytKomennot: [/\\bjulkaise-tuotantoon\\b/].map((m) => [m, 'ei julkaista']),
  koodisaannot: [], sallitutAsennusskriptit: {}, tarkistukset: [], eiOmiaTarkistuksia: null,
  nodeVersio: null, tyokalut: [], eiSkanneria: null, ${muutokset}
}
`

function luoKopio(muutokset) {
  const kansio = realpathSync(mkdtempSync(join(tmpdir(), 'turvavahti-')))
  for (const p of ['.claude/hooks/turvavahti.mjs', 'tools/turvasaannot.mjs', '.gitleaks.toml']) {
    mkdirSync(dirname(join(kansio, p)), { recursive: true })
    cpSync(join(juuri, p), join(kansio, p))
  }
  writeFileSync(join(kansio, 'tools/projekti.mjs'), asetukset(muutokset))
  return kansio
}

function aja(kansio, tool_name, tool_input, env = process.env) {
  return spawnSync(process.execPath, [join(kansio, '.claude/hooks/turvavahti.mjs')], { input: JSON.stringify({ tool_name, tool_input }), encoding: 'utf8', env }).status
}

describe('turvavahti', () => {
  let kopio
  before(() => { kopio = luoKopio() })
  after(() => rmSync(kopio, { recursive: true, force: true }))
  const koodi = (nimi, syote) => aja(kopio, nimi, syote)
  const komento = (command) => koodi('Bash', { command })

  describe('git-hookien polku', () => {
    for (const k of [
      'git config core.hooksPath /tmp/x',
      'git config core.hookspath /tmp/x',
      'git config CORE.HOOKSPATH /tmp/x',
      'git config --unset core.hooksPath',
      'git -c core.hookspath=/dev/null commit -m x',
      'git config core.hooksPath /tmp/x && echo .githooks',
      'git config core.hooksPath .githooks/../muu',
      'git config --get core.hooksPath; git config core.hooksPath /tmp/x',
    ]) it(`estää: ${k}`, () => assert.equal(komento(k), 2))

    for (const k of [
      'git config --get core.hooksPath',
      'git config --local --get core.hookspath',
      'git config core.hooksPath .githooks',
      'git config core.hooksPath ".githooks" && git status',
    ]) it(`sallii: ${k}`, () => assert.equal(komento(k), 0))
  })

  describe('avain- ja tunnistetiedostot komennoissa', () => {
    for (const k of [
      'cat varmenne.pem',
      'cat web/.env.local',
      'cat palvelu.key',
      'cp avain.keystore /tmp/',
      'cat serviceAccount.json',
      'cat projekti-service-account-1.json',
      'cat credentials.json',
      'cat client_secret_123.json',
      'cat .secret.local',
      'cat vienti.xlsx',
    ]) it(`estää: ${k}`, () => assert.equal(komento(k), 2))

    for (const k of [
      'ls tools',
      'node tools/tarkista.mjs',
      'cat package.json',
      'git diff -- web/.env.example',
    ]) it(`sallii: ${k}`, () => assert.equal(komento(k), 0))
  })

  describe('koodin vienti ulos ja tarkistusten ohitus', () => {
    for (const k of [
      'git push',
      'git -C . push origin main',
      'git -c a=b push',
      'git -C . remote add ulos jokin',
      'gh repo create',
      'git commit --no-verify -m x',
      'git commit -n -m x',
      'julkaise-tuotantoon --nyt',
    ]) it(`estää: ${k}`, () => assert.equal(komento(k), 2))

    for (const k of [
      'git commit -m "push on estetty hookissa"',
      'git log --grep push',
      'git remote -v',
    ]) it(`sallii: ${k}`, () => assert.equal(komento(k), 0))
  })

  describe('tiedostotyökalut', () => {
    it('estää avaimen lukemisen', () => assert.equal(koodi('Read', { file_path: 'palvelu.key' }), 2))
    it('sallii tavallisen tiedoston lukemisen', () => assert.equal(koodi('Read', { file_path: 'README.md' }), 0))
    it('sallii testin kuvakaappauksen katsomisen', () => assert.equal(koodi('Read', { file_path: 'tmp/kuva.png' }), 0))
    it('estää henkilötunnuksen kirjoittamisen', () => assert.equal(koodi('Write', { file_path: 'a.md', content: `x ${HETU}` }), 2))
    it('estää oikean sähköpostin muokkauksessa', () => assert.equal(koodi('Edit', { file_path: 'a.md', new_string: `x${at}yritys.fi` }), 2))
    it('estää salaisuuden kirjoittamisen', () => assert.equal(koodi('Write', { file_path: 'a.ts', content: `const s = "${OAUTH}"` }), 2))
    it('estää salaisuuden komennossa', () => assert.equal(komento(`echo ${OAUTH} > a.txt`), 2))
    it('sallii keksityn osoitteen', () => assert.equal(koodi('Write', { file_path: 'a.md', content: `x${at}yritys.test` }), 0))
  })
})

describe('turvavahti: etärepo sallittu', () => {
  it('push ja remote sallitaan, muut kiellot pysyvät', () => {
    const kopio = luoKopio('etarepoSallittu: true')
    try {
      assert.equal(aja(kopio, 'Bash', { command: 'git push' }), 0)
      assert.equal(aja(kopio, 'Bash', { command: 'gh pr list' }), 0)
      assert.equal(aja(kopio, 'Bash', { command: 'git commit --no-verify -m x' }), 2)
    } finally {
      rmSync(kopio, { recursive: true, force: true })
    }
  })
})

// Claude Code päästää kutsun läpi kaikilla muilla virhekoodeilla kuin 2.
// Rikkinäinen vahti ei siis saa kaatua millään muulla koodilla.
describe('turvavahti: rikkinäinen vahti estää', () => {
  it('estää, jos turvasaannot.mjs puuttuu', () => {
    const kopio = luoKopio()
    try {
      rmSync(join(kopio, 'tools/turvasaannot.mjs'))
      assert.equal(aja(kopio, 'Read', { file_path: 'README.md' }), 2)
    } finally {
      rmSync(kopio, { recursive: true, force: true })
    }
  })
  it('estää, jos projekti.mjs puuttuu', () => {
    const kopio = luoKopio()
    try {
      rmSync(join(kopio, 'tools/projekti.mjs'))
      assert.equal(aja(kopio, 'Bash', { command: 'ls' }), 2)
    } finally {
      rmSync(kopio, { recursive: true, force: true })
    }
  })
  it('estää, jos syöte ei ole JSONia', () => {
    const kopio = luoKopio()
    try {
      const r = spawnSync(process.execPath, [join(kopio, '.claude/hooks/turvavahti.mjs')], { input: 'ei json', encoding: 'utf8' })
      assert.equal(r.status, 2)
    } finally {
      rmSync(kopio, { recursive: true, force: true })
    }
  })
  it('estää, jos gitleaks puuttuu', () => {
    const kopio = luoKopio()
    const tyhja = mkdtempSync(join(tmpdir(), 'turvabin-'))
    try {
      assert.equal(aja(kopio, 'Write', { file_path: 'a.md', content: 'x' }, { ...process.env, PATH: tyhja }), 2)
    } finally {
      rmSync(kopio, { recursive: true, force: true })
      rmSync(tyhja, { recursive: true, force: true })
    }
  })
})
