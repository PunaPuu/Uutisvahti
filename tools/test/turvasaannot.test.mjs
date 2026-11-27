// Todistaa, että turvasäännöt, git-hookit ja tarkistusskriptin osat oikeasti
// estävät sen, mitä niiden pitää. Kaikki arvot ovat keksittyjä, ja salaisuuden
// tai henkilötunnuksen näköiset arvot kootaan vasta ajossa, jotta tämä tiedosto
// ei itse laukaise tarkistuksia.
//
// Säännöt ajetaan kiinteillä asetuksilla, joten testit todistavat mekanismin
// riippumatta projektin omista valinnoista (ne testaa projekti.test.mjs).
//
//   node --test tools/test/*.test.mjs

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { eiSuoritettavatHookit, loydaPaikkamerkit, nodeKelpaa, ohitettujenVaroitus, omatMaaritelty, osvKannanVaroitus, siivoa, suorita, vanhatLokit } from '../tarkista.mjs'
import { hetuKelpaa, tarkistaLukitus, tarkistaPolku, tarkistaSisalto } from '../turvasaannot.mjs'
import { etuliite, vanhat } from '../varmuuskopio.mjs'

const juuri = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = '@'
// Väestörekisterikeskuksen julkaisema esimerkkitunnus, ei oikean henkilön.
const HETU = '131052' + '-308T'
const OAUTH = 'GOCSPX' + '-' + 'Qk3vT9xZp2LmN8wR4yB7cH1dF6gJ'

const VAKIO = {
  etarepoSallittu: false,
  henkilotiedot: { henkilotunnus: true, sahkoposti: true, puhelinnumero: true, lisamallit: [] },
  sallitutDomainit: [],
  sallitutKuvakansiot: ['public', 'docs/kuvat/'],
  kielletytNimet: [],
  kielletytKomennot: [],
  koodisaannot: [{ id: 'esimerkkisaanto', polut: /^src\//, malli: /kiellettyKutsu\(/, kuvaus: 'esimerkki' }],
  sallitutAsennusskriptit: { fsevents: 'testi' },
  tarkistukset: [],
  eiOmiaTarkistuksia: null,
}
const saannot = (polku, teksti, a = VAKIO) => tarkistaSisalto(polku, teksti, a).map((l) => l.saanto)

const PROJEKTI_TIEDOSTO = (etarepo = false) => `export const PROJEKTI = {
  etarepoSallittu: ${etarepo},
  henkilotiedot: { henkilotunnus: true, sahkoposti: true, puhelinnumero: true, lisamallit: [] },
  sallitutDomainit: [], sallitutKuvakansiot: ['public'], kielletytNimet: [], kielletytKomennot: [],
  koodisaannot: [{ id: 'esimerkkisaanto', polut: /^src\\//, malli: /kiellettyKutsu\\(/, kuvaus: 'esimerkki' }],
  sallitutAsennusskriptit: {}, tarkistukset: [], eiOmiaTarkistuksia: null, nodeVersio: null, tyokalut: [], eiSkanneria: null,
}
`

describe('ajo symlinkin kautta', () => {
  // Jos skripti luulee, ettei sitä ajettu suoraan, se ei tee mitään ja palauttaa
  // koodin 0: tarkistus näyttäisi menneen läpi, vaikka sitä ei ajettu.
  test('turvasäännöt ajetaan myös symlinkin kautta', { skip: process.platform === 'win32' }, () => {
    const kansio = mkdtempSync(join(tmpdir(), 'turvasymlink-'))
    try {
      const linkki = join(kansio, 'tools')
      symlinkSync(join(juuri, 'tools'), linkki)
      const r = spawnSync(process.execPath, [join(linkki, 'turvasaannot.mjs')], { cwd: juuri, encoding: 'utf8' })
      assert.equal(r.status, 2, 'ilman parametreja pitää tulla käyttöohje ja koodi 2')
      assert.match(r.stderr, /Käyttö:/)
    } finally {
      rmSync(kansio, { recursive: true, force: true })
    }
  })
})

describe('henkilötiedot', () => {
  test('henkilötunnuksen tarkiste', () => {
    assert.equal(hetuKelpaa('13', '10', '52', '308', 'T'), true)
    assert.equal(hetuKelpaa('13', '10', '52', '308', 'U'), false)
  })
  test('henkilötunnus löytyy, väärä tarkiste ei', () => {
    assert.deepEqual(saannot('a.md', `asiakas ${HETU}`), ['henkilotunnus'])
    assert.deepEqual(saannot('a.md', 'asiakas 131052' + '-308U'), [])
    assert.deepEqual(saannot('a.md', 'vuosisatamerkki A: 010101' + 'A123N'), ['henkilotunnus'])
  })
  test('sähköposti oikeassa verkkotunnuksessa löytyy', () => {
    assert.deepEqual(saannot('a.ts', `"matti.m${at}yritys.fi"`), ['sahkoposti'])
  })
  test('keksityt ja varatut verkkotunnukset sallitaan', () => {
    for (const d of ['yritys.test', 'a.esimerkki.test', 'example.com', 'jotain.example', 'anthropic.com']) {
      assert.deepEqual(saannot('a.ts', `nimi${at}${d}`), [], d)
    }
    assert.deepEqual(saannot('a.ts', `"paketti${at}15.32.1"`), [])
  })
  test('projektin omat sallitut verkkotunnukset', () => {
    const a = { ...VAKIO, sallitutDomainit: [/(^|\.)toimittaja\.com$/i] }
    assert.deepEqual(saannot('a.md', `tuki${at}toimittaja.com`, a), [])
    assert.deepEqual(saannot('a.md', `tuki${at}muu.com`, a), ['sahkoposti'])
  })
  test('lukitustiedostojen tekijäosoitteet ohitetaan', () => {
    assert.deepEqual(saannot('web/package-lock.json', `"author": "x${at}tekija.me"`), [])
  })
  test('matkapuhelinnumerot löytyvät', () => {
    assert.deepEqual(saannot('a.md', `soita ${['+358', '40', '123', '4567'].join(' ')}`), ['puhelinnumero'])
    assert.deepEqual(saannot('a.md', `soita ${['050', '123', '4567'].join('-')}`), ['puhelinnumero'])
    assert.deepEqual(saannot('a.md', 'versio 10.0.26100.9448'), [])
  })
  test('tarkistukset voi kytkeä pois projektikohtaisesti', () => {
    const pois = { ...VAKIO, henkilotiedot: { henkilotunnus: false, sahkoposti: false, puhelinnumero: false, lisamallit: [] } }
    assert.deepEqual(saannot('a.md', `${HETU} x${at}yritys.fi 050-` + '123-4567', pois), [])
  })
  test('projektin omaa henkilötietomallia ei voi ohittaa kommentilla', () => {
    const a = { ...VAKIO, henkilotiedot: { ...VAKIO.henkilotiedot, lisamallit: [['asiakasnumero', /ASK-\d{6}/, 'asiakasnumero']] } }
    assert.deepEqual(saannot('a.md', '// turva-ok: testi\nASK-123456', a), ['asiakasnumero'])
  })
})

describe('kielletyt tiedostot', () => {
  const nimet = (polku, koko = 10, sisalto = 'x', a = VAKIO) => tarkistaPolku(polku, koko, sisalto, a).map((l) => l.saanto)
  test('avaimet, env ja viennit estetään', () => {
    for (const p of ['web/.env', 'web/.env.production', 'a/server.key', 'cert.pem', 'x/serviceAccount.json',
      'client_secret_1.json', 'vienti.xlsx', 'functions/.secret.local', 'vienti.csv']) {
      assert.ok(nimet(p).includes('kielletty-tiedosto'), p)
    }
  })
  test('.env.example sallitaan vain tyhjillä arvoilla', () => {
    assert.deepEqual(nimet('web/.env.example', 10, 'A=\n# kommentti\nB='), [])
    assert.deepEqual(nimet('web/.env.example', 10, 'A=oikea-arvo'), ['env-esimerkki'])
  })
  test('keksitty CSV sallitaan testidata-kansiossa', () => {
    assert.deepEqual(nimet('testidata/laitteet.csv', 10, '# KEKSITTY\na;b'), [])
    assert.deepEqual(nimet('testidata/laitteet.csv', 10, 'a;b'), ['kielletty-tiedosto'])
    assert.deepEqual(nimet('muualla/laitteet.csv', 10, '# KEKSITTY\na;b'), ['kielletty-tiedosto'])
  })
  test('.npmrc estetään', () => {
    assert.ok(nimet('web/.npmrc').includes('kielletty-tiedosto'))
  })
  test('projektin omat kielletyt nimet', () => {
    const a = { ...VAKIO, kielletytNimet: [[/(^|\/)\.emulaattori\//, 'emulaattorin data']] }
    assert.ok(nimet('.emulaattori/x', 10, 'x', a).includes('kielletty-tiedosto'))
    assert.deepEqual(nimet('.emulaattori/x'), [])
  })
  test('uusi asennusskriptillinen paketti estetään, tunnetut sallitaan', () => {
    const lukitus = (paketit) => JSON.stringify({ packages: { '': {}, ...paketit } })
    const tunnetut = { 'node_modules/a/node_modules/fsevents': { hasInstallScript: true }, 'node_modules/react': {} }
    assert.deepEqual(tarkistaLukitus(lukitus(tunnetut), VAKIO), [])
    const uusi = tarkistaLukitus(lukitus({ ...tunnetut, 'node_modules/paha-paketti': { hasInstallScript: true } }), VAKIO)
    assert.equal(uusi.length, 1)
    assert.match(uusi[0].kuvaus, /paha-paketti/)
  })
  test('yli megatavun tiedosto estetään', () => {
    assert.deepEqual(nimet('arkisto.bin', 2 * 1024 * 1024, null), ['iso-tiedosto'])
    assert.deepEqual(nimet('public/iso.png', 2 * 1024 * 1024, null), ['iso-tiedosto'])
  })
  test('kuva estetään sallittujen kansioiden ulkopuolella', () => {
    for (const p of ['kuva.png', 'Kuva.PNG', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.heic', 'a.tiff', 'a.bmp',
      'src/nakyma.png', 'publicx/a.png', 'ali/public/a.png', 'docs/a.png']) {
      assert.deepEqual(nimet(p), ['kuvatiedosto'], p)
    }
  })
  test('kuva sallitaan listatussa kansiossa', () => {
    for (const p of ['public/logo.png', 'public/ali/a.jpg', 'docs/kuvat/a.png']) assert.deepEqual(nimet(p), [], p)
    assert.deepEqual(nimet('logo.svg'), [], 'SVG on tekstiä, joten sen sisältö tarkistetaan')
  })
})

describe('koodisäännöt', () => {
  test('sääntö osuu vain omiin polkuihinsa', () => {
    assert.deepEqual(saannot('src/a.ts', 'kiellettyKutsu()'), ['esimerkkisaanto'])
    assert.deepEqual(saannot('docs/a.md', 'kiellettyKutsu()'), [])
  })
  test('rivin voi ohittaa perustellulla kommentilla', () => {
    assert.deepEqual(saannot('src/a.ts', '// turva-ok: syy\nkiellettyKutsu()'), [])
    assert.deepEqual(saannot('src/a.ts', 'kiellettyKutsu() // turva-ok: syy'), [])
    assert.deepEqual(saannot('src/a.ts', '// turva-ok:\nkiellettyKutsu()'), ['esimerkkisaanto'], 'ilman syytä ei kelpaa')
  })
  test('salaisuuksia ja henkilötietoja ei voi ohittaa kommentilla', () => {
    assert.deepEqual(saannot('a.ts', `// turva-ok: testi\nconst h = "${HETU}"`), ['henkilotunnus'])
  })
})

describe('tarkistuksen lokit', () => {
  test('vain uusimmat lokit säilytetään', () => {
    const n = Array.from({ length: 22 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}T00-00-00.log`)
    assert.deepEqual(vanhatLokit([...n, 'muu.txt']), n.slice(0, 2))
    assert.deepEqual(vanhatLokit(n.slice(0, 3)), [])
  })
})

describe('väliaikaiset tiedostot ja kuvakaappaukset', () => {
  test('.gitignore jättää ne pois, muttei tavallisia kansioita', () => {
    const k = mkdtempSync(join(tmpdir(), 'turvaignore-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: k })
      cpSync(join(juuri, '.gitignore'), join(k, '.gitignore'))
      const ohitetaan = (p) => spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: k }).status === 0
      for (const p of ['tmp/a.txt', 'ali/temp/a.txt', 'a.tmp', 'coverage/a.json', 'test-results/a.png', 'playwright-report/a.png',
        'screenshots/a.png', 'Screenshot 2026-11-05 at 10.00.00.png', 'Screen Shot 2026-11-05.png', 'Näyttökuva 2026-11-05.png', 'Kuvakaappaus1.png']) {
        assert.ok(ohitetaan(p), p)
      }
      for (const p of ['src/a.ts', 'public/logo.png', 'docs/ohje.md']) assert.ok(!ohitetaan(p), p)
    } finally {
      rmSync(k, { recursive: true, force: true })
    }
  })
})

describe('siivous vihreän ajon jälkeen', () => {
  const vihrea = [['ok', () => ({ koodi: 0, tuloste: '' })]]
  const punainen = [['rikki', () => ({ koodi: 1, tuloste: 'rikki' })]]
  const ajo = (valinnat, tarkistukset) => {
    let kutsuttu = 0
    const koodi = suorita(valinnat, tarkistukset, () => {}, () => { kutsuttu++; return [] })
    return { koodi, kutsuttu }
  }
  test('täysi vihreä ajo siivoaa', () => {
    assert.deepEqual(ajo({ kerrat: 2, nopea: false }, vihrea), { koodi: 0, kutsuttu: 1 })
  })
  test('punainen ja vajaa ajo jättävät tiedostot selvitystä varten', () => {
    assert.deepEqual(ajo({ kerrat: 2, nopea: false }, punainen), { koodi: 1, kutsuttu: 0 })
    assert.deepEqual(ajo({ kerrat: 1, nopea: false }, vihrea), { koodi: 1, kutsuttu: 0 })
    assert.deepEqual(ajo({ kerrat: 2, nopea: true }, [['hidas', () => ({ koodi: 0, tuloste: '' }), 'hidas']]), { koodi: 1, kutsuttu: 0 })
  })
  test('epäonnistunut siivous ei ole vihreä', () => {
    assert.equal(suorita({ kerrat: 2, nopea: false }, vihrea, () => {}, () => { throw new Error('lukittu') }), 1)
  })
  test('poistaa vain väliaikaiset, ei commitoituja eikä muita ohitettuja', () => {
    const k = realpathSync(mkdtempSync(join(tmpdir(), 'turvasiivous-')))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: k })
      // Macissa ja Windowsissa git ei välitä kirjainkoosta; testi ei saa riippua koneesta.
      execFileSync('git', ['config', 'core.ignorecase', 'true'], { cwd: k })
      cpSync(join(juuri, '.gitignore'), join(k, '.gitignore'))
      const luo = (p) => {
        mkdirSync(dirname(join(k, p)), { recursive: true })
        writeFileSync(join(k, p), 'x\n')
      }
      const poistuvat = ['tmp/a.txt', 'ali/temp/b.txt', 'c.tmp', 'd.temp', 'coverage/e.json', 'ali/test-results/f.png',
        'playwright-report/g.png', 'screenshots/h.png', 'Screenshot 1.png', 'Näyttökuva 2.png', 'ali/Kuvakaappaus3.png', 'kuvakaappaus4.png', 'ali/screenshot 5.png']
      const pysyvat = ['src/a.ts', 'tmp.txt', 'public/logo.png', 'node_modules/p/tmp/keep.js', '.tarkistus/l.log', 'kirjaudu.log', 'tmp/commitoitu.txt']
      for (const p of [...poistuvat, ...pysyvat]) luo(p)
      execFileSync('git', ['add', '-f', 'tmp/commitoitu.txt'], { cwd: k })
      siivoa(k)
      for (const p of poistuvat) assert.ok(!existsSync(join(k, p)), `piti poistua: ${p}`)
      for (const p of pysyvat) assert.ok(existsSync(join(k, p)), `piti säilyä: ${p}`)
    } finally {
      rmSync(k, { recursive: true, force: true })
    }
  })
})

describe('pikatila ja varoitukset', () => {
  const vihrea = [['ok', () => ({ koodi: 0, tuloste: '' })]]
  test('--nopea ei ole vihreä eikä siivoa, vaikka hitaita tarkistuksia ei olisi', () => {
    let siivottu = 0
    const rivit = []
    const koodi = suorita({ kerrat: 2, nopea: true }, vihrea, (t) => rivit.push(t), () => { siivottu++; return [] })
    assert.equal(koodi, 1)
    assert.equal(siivottu, 0)
    assert.ok(rivit.some((r) => r.includes('TULOS: KESKEN')), rivit.join(''))
  })
  test('tarkistuksen varoitus näytetään kerran, eikä se muuta tulosta', () => {
    const rivit = []
    const tarkistukset = [['varoittaa', () => ({ koodi: 0, tuloste: '', varoitus: 'vanha tieto' })]]
    assert.equal(suorita({ kerrat: 2, nopea: false }, tarkistukset, (t) => rivit.push(t), () => []), 0)
    assert.equal(rivit.filter((r) => r.includes('Huom: vanha tieto')).length, 1)
  })
  test('vanhasta tai tuntemattomasta osv-tietokannasta varoitetaan', () => {
    const k = mkdtempSync(join(tmpdir(), 'turvaosv-'))
    try {
      const nyt = Date.parse('2026-11-30T12:00:00')
      assert.match(osvKannanVaroitus(k, nyt), /ikää ei voitu selvittää/)
      mkdirSync(join(k, 'osv-db'))
      writeFileSync(join(k, 'osv-db', 'SOURCE.json'), JSON.stringify({ downloaded: '2026-11-20T12:00:00' }))
      assert.equal(osvKannanVaroitus(k, nyt), null)
      writeFileSync(join(k, 'osv-db', 'SOURCE.json'), JSON.stringify({ downloaded: '2026-10-09T12:00:00' }))
      assert.match(osvKannanVaroitus(k, nyt), /52 päivää vanha/)
    } finally {
      rmSync(k, { recursive: true, force: true })
    }
  })
  test('ei sovellu näkyy tuloksessa, ei vihreänä', () => {
    const alkuperainen = console.log
    const rivit = []
    console.log = (r) => rivit.push(String(r))
    try {
      const koodi = suorita({ kerrat: 2, nopea: false }, [['audit', () => ({ koodi: 0, tuloste: 'Ei sovellu', tila: 'EI SOVELLU' })]], () => {}, () => [])
      assert.equal(koodi, 0)
    } finally {
      console.log = alkuperainen
    }
    assert.ok(rivit.some((r) => r.startsWith('EI SOVELLU')), rivit.join('|'))
    assert.ok(!rivit.some((r) => r.startsWith('vihreä')), rivit.join('|'))
  })
  test('ohitetut turvatestit kerrotaan nimeltä', () => {
    assert.equal(ohitettujenVaroitus('# tests 2\n# pass 2\n# skipped 0\n'), null)
    const v = ohitettujenVaroitus('ok 1 - tavallinen\n    ok 2 - symlinkki # SKIP\n# tests 2\n# skipped 1\n')
    assert.match(v, /1 turvatestiä/)
    assert.match(v, /symlinkki/)
  })
})

describe('varmuuskopioiden säilytys', () => {
  test('vain oman projektin uusimmat säilytetään', () => {
    const n = Array.from({ length: 12 }, (_, i) => `oma-202610${String(i + 10)}-000000-abc.bundle`)
    const muu = 'toinen-20261001-000000-abc.bundle'
    assert.deepEqual(vanhat([...n, muu, 'muu.txt'], 'oma-', 10), n.slice(0, 2))
    assert.deepEqual(vanhat(n.slice(0, 3), 'oma-', 10), [])
  })
  test('etuliite tulee kansion nimestä', () => {
    assert.equal(etuliite('/polku/Oma Projekti (V2)'), 'oma-projekti-v2-')
  })
})

// ---------------------------------------------------------------------------
// Tarkistusskripti: ohitettu tai puuttuva ei ole vihreä
// ---------------------------------------------------------------------------

describe('tarkistusskripti', () => {
  test('tyhjä tarkistuslista on punainen ilman syytä', () => {
    assert.equal(omatMaaritelty({ tarkistukset: [], eiOmiaTarkistuksia: null }).koodi, 1)
    assert.equal(omatMaaritelty({ tarkistukset: [], eiOmiaTarkistuksia: 'pelkkä dokumentti' }).koodi, 0)
    assert.equal(omatMaaritelty({ tarkistukset: [{ nimi: 'x', komento: ['x'] }], eiOmiaTarkistuksia: null }).koodi, 0)
  })
  test('täyttämättömät paikkamerkit löytyvät', () => {
    const k = mkdtempSync(join(tmpdir(), 'turvapaikka-'))
    try {
      writeFileSync(join(k, 'CLAUDE.md'), '# {{PROJECT_NAME}}\n')
      assert.deepEqual(loydaPaikkamerkit(k), ['CLAUDE.md: {{PROJECT_NAME}}'])
      writeFileSync(join(k, 'CLAUDE.md'), '# Oma\n')
      assert.deepEqual(loydaPaikkamerkit(k), [])
    } finally {
      rmSync(k, { recursive: true, force: true })
    }
  })
  test('Node-versio', () => {
    assert.equal(nodeKelpaa('22.1.0', null), true)
    assert.equal(nodeKelpaa('24.0.0', null), true)
    assert.equal(nodeKelpaa('20.11.0', null), false)
    assert.equal(nodeKelpaa('24.0.0', 22), false)
  })
  test('hook ilman suoritusoikeutta löytyy', { skip: process.platform === 'win32' }, () => {
    const k = mkdtempSync(join(tmpdir(), 'turvaoikeus-'))
    try {
      writeFileSync(join(k, 'pre-commit'), '#!/bin/sh\n')
      chmodSync(join(k, 'pre-commit'), 0o644)
      writeFileSync(join(k, 'yhteiset.sh'), '')
      assert.deepEqual(eiSuoritettavatHookit(k), ['pre-commit'])
      chmodSync(join(k, 'pre-commit'), 0o755)
      assert.deepEqual(eiSuoritettavatHookit(k), [])
    } finally {
      rmSync(k, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Git-hookit oikeassa (väliaikaisessa) repossa
// ---------------------------------------------------------------------------

describe('git-hookit', () => {
  let repo
  let varmuus
  const g = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  const kirjoita = (polku, sisalto) => {
    mkdirSync(dirname(join(repo, polku)), { recursive: true })
    writeFileSync(join(repo, polku), sisalto)
  }
  const commit = (viesti = 'muutos') => g('commit', '-q', '-m', viesti)
  const peru = () => {
    g('reset', '-q', '--hard')
    g('clean', '-qfd')
  }

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'turvahookit-')))
    varmuus = mkdtempSync(join(tmpdir(), 'turvavarmuus-'))
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
    for (const p of ['.githooks', 'tools/turvasaannot.mjs', 'tools/varmuuskopio.mjs', '.gitleaks.toml']) kopioi(join(juuri, p), join(repo, p))
    writeFileSync(join(repo, 'tools/projekti.mjs'), PROJEKTI_TIEDOSTO())
    g('config', 'user.name', 'Testi')
    g('config', 'user.email', `testi${at}example.test`)
    g('config', 'core.autocrlf', 'false')
    g('config', 'commit.gpgsign', 'false')
    g('config', 'core.hooksPath', '.githooks')
    g('config', 'projekti.varmuuskopio', varmuus)
    g('add', '-A')
    const eka = commit('ensimmäinen')
    assert.equal(eka.status, 0, `ensimmäinen commit mainiin sallitaan: ${eka.stderr}`)
    g('switch', '-q', '-c', 'testi/haara')
  })
  after(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(varmuus, { recursive: true, force: true })
  })

  test('puhdas muutos menee läpi', () => {
    kirjoita('docs/ohje.md', `Ota yhteyttä: tuki${at}yritys.test\n`)
    g('add', '-A')
    const r = commit()
    assert.equal(r.status, 0, r.stderr)
  })
  test('salaisuus estetään', () => {
    kirjoita('src/asetukset.ts', `export const s = "${OAUTH}";\n`)
    g('add', '-A')
    const r = commit()
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /gitleaks/)
  })
  test('henkilötunnus estetään', () => {
    kirjoita('docs/lista.md', `asiakas ${HETU}\n`)
    g('add', '-A')
    const r = commit()
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /henkilotunnus/)
  })
  test('projektin koodisääntö estää', () => {
    kirjoita('src/a.ts', 'kiellettyKutsu()\n')
    g('add', '-A')
    const r = commit()
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /esimerkkisaanto/)
  })
  test('vientitiedosto estetään, vaikka se pakotettaisiin mukaan', () => {
    kirjoita('vienti.csv', 'a;b\n1;2\n')
    g('add', '-f', 'vienti.csv')
    const r = commit()
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /kielletty-tiedosto/)
  })
  test('henkilötieto commit-viestissä estetään', () => {
    kirjoita('docs/toinen.md', 'x\n')
    g('add', '-A')
    const r = commit(`korjaus asiakkaalle ${HETU}`)
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /henkilotunnus/)
  })
  test('suora commit mainiin estetään', () => {
    g('switch', '-q', 'main')
    kirjoita('docs/suoraan.md', 'x\n')
    g('add', '-A')
    const r = commit()
    peru()
    g('switch', '-q', 'testi/haara')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /main-haaraan/)
  })
  test('commit estetään, jos gitleaks puuttuu', { skip: process.platform === 'win32' || existsSync('/usr/bin/gitleaks') }, () => {
    const bin = mkdtempSync(join(tmpdir(), 'turvabin-'))
    try {
      symlinkSync(process.execPath, join(bin, 'node'))
      kirjoita('docs/kolmas.md', 'x\n')
      g('add', '-A')
      const r = spawnSync('git', ['commit', '-q', '-m', 'x'], { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } })
      peru()
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /gitleaks puuttuu/)
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })
  test('push estetään', () => {
    const etä = mkdtempSync(join(tmpdir(), 'turvahookit-eta-'))
    try {
      execFileSync('git', ['init', '-q', '--bare'], { cwd: etä })
      g('remote', 'add', 'koe', etä)
      const r = g('push', 'koe', 'testi/haara')
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /ei pushata/)
    } finally {
      g('remote', 'remove', 'koe')
      rmSync(etä, { recursive: true, force: true })
    }
  })
  test('push sallitaan vain, jos etärepo on päätetty sallia', () => {
    const etä = mkdtempSync(join(tmpdir(), 'turvahookit-eta-'))
    try {
      execFileSync('git', ['init', '-q', '--bare'], { cwd: etä })
      g('remote', 'add', 'koe', etä)
      writeFileSync(join(repo, 'tools/projekti.mjs'), PROJEKTI_TIEDOSTO(true))
      const r = g('push', 'koe', 'testi/haara')
      assert.equal(r.status, 0, r.stderr)
    } finally {
      writeFileSync(join(repo, 'tools/projekti.mjs'), PROJEKTI_TIEDOSTO())
      g('remote', 'remove', 'koe')
      rmSync(etä, { recursive: true, force: true })
    }
  })
  test('kuvakaappaus estetään, vaikka se pakotettaisiin mukaan', () => {
    kirjoita('tulos/virhe.png', 'kuva\n')
    g('add', '-f', 'tulos/virhe.png')
    const r = commit()
    peru()
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /kuvatiedosto/)
  })
  test('sallitun kansion kuva menee läpi, ja siitä huomautetaan', () => {
    kirjoita('public/logo.png', 'kuva\n')
    g('add', '-A')
    const r = commit('logo')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stderr, /public\/logo\.png on kuva/)
  })
  test('keksitty CSV testidata-kansiossa ei kaada historiatarkistusta', () => {
    kirjoita('testidata/rivit.csv', '# KEKSITTY\na;b\n')
    g('add', '-f', 'testidata/rivit.csv')
    const r = commit('testidataa')
    assert.equal(r.status, 0, r.stderr)
    const h = spawnSync(process.execPath, [join(repo, 'tools/turvasaannot.mjs'), '--historia'], { cwd: repo, encoding: 'utf8' })
    assert.equal(h.status, 0, h.stderr)
  })
  test('--historia löytää poistetun binääritiedoston ja välilyönti- tai ääkkösnimen', () => {
    const kuva = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
    const ohita = ['-c', 'core.hooksPath=/dev/null']
    for (const [polku, sisalto, saanto] of [
      ['muualla/kuva.png', kuva, 'kuvatiedosto'],
      ['Näyttökuva 1.png', kuva, 'kuvatiedosto'],
      ['vienti 1.csv', 'a;b\n', 'kielletty-tiedosto'],
    ]) {
      kirjoita(polku, sisalto)
      g('add', '-f', polku)
      assert.equal(g(...ohita, 'commit', '-q', '-m', 'lisäys').status, 0, polku)
      g(...ohita, 'rm', '-q', polku)
      assert.equal(g(...ohita, 'commit', '-q', '-m', 'poisto').status, 0, polku)
      const h = spawnSync(process.execPath, [join(repo, 'tools/turvasaannot.mjs'), '--historia'], { cwd: repo, encoding: 'utf8' })
      g('reset', '-q', '--hard', 'HEAD~2')
      assert.equal(h.status, 1, `${polku}: ${h.stderr}`)
      assert.ok(h.stderr.includes(`:${polku}`) && h.stderr.includes(`[${saanto}]`), h.stderr)
    }
  })
  test('yhdistäminen mainiin tekee varmuuskopion (post-merge)', () => {
    g('switch', '-q', 'main')
    const r = g('merge', '--no-ff', '-m', 'yhdistä', 'testi/haara')
    g('switch', '-q', 'testi/haara')
    assert.equal(r.status, 0, r.stderr)
    const bundlet = readdirSync(varmuus).filter((n) => n.endsWith('.bundle'))
    assert.equal(bundlet.length, 1, r.stderr)
    assert.equal(spawnSync('git', ['bundle', 'verify', join(varmuus, bundlet[0])], { cwd: repo }).status, 0)
  })
  test('yhdistäminen tarkistetaan (pre-merge-commit)', () => {
    g('switch', '-q', '-c', 'testi/paha')
    kirjoita('docs/paha.md', `asiakas ${HETU}\n`)
    g('add', '-A')
    // Ohitetaan hookit tässä yhdessä commitissa, jotta voidaan todistaa, että
    // yhdistäminen ja historiatarkistus pysäyttävät sen silti.
    assert.equal(g('-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'ohitettu').status, 0)
    g('switch', '-q', 'testi/haara')
    const r = g('merge', '--no-ff', '-m', 'yhdistä', 'testi/paha')
    g('merge', '--abort')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /henkilotunnus/)
    const h = spawnSync(process.execPath, [join(repo, 'tools/turvasaannot.mjs'), '--historia'], { cwd: repo, encoding: 'utf8' })
    assert.notEqual(h.status, 0)
    assert.match(h.stderr, /henkilotunnus/)
  })
})

// Node 22:n rekursiivinen cpSync kaatuu Windowsissa koko prosessin, jos lähdekansion
// polussa on ääkkönen (exit 0xC0000409). Siksi kansiot kopioidaan tiedosto kerrallaan.
function kopioi(lahde, kohde) {
  if (statSync(lahde).isDirectory()) {
    mkdirSync(kohde, { recursive: true })
    for (const nimi of readdirSync(lahde)) kopioi(join(lahde, nimi), join(kohde, nimi))
  } else {
    mkdirSync(dirname(kohde), { recursive: true })
    copyFileSync(lahde, kohde)
  }
}
