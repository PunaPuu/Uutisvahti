#!/usr/bin/env node
// Koko projektin tarkistus: node tools/tarkista.mjs
//
// Ajaa kaikki tarkistukset kahdesti peräkkäin. Työ on valmis vasta tuloksella
// "TULOS: VIHREÄ 2/2". Ensimmäinen punainen tarkistus pysäyttää ajon. Ohitettu
// tai puuttuva tarkistus ei koskaan ole vihreä. Vihreä ajo poistaa testien
// väliaikaiset tiedostot ja kuvakaappaukset. Loki tallentuu kansioon .tarkistus/.
//
//   node tools/tarkista.mjs                 kaksi täyttä kierrosta
//   node tools/tarkista.mjs --kerrat 1      yksi kierros: tulos KESKEN, koodi 1
//   node tools/tarkista.mjs --nopea         ilman hitaita tarkistuksia: tulos KESKEN, koodi 1

import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PROJEKTI } from './projekti.mjs'

const juuri = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const ymparisto = { ...process.env, FORCE_COLOR: '0' }

function aja(komento, args, cwd = juuri) {
  // npm, npx ja monet muut komennot ovat Windowsissa .cmd-tiedostoja, jotka vaativat shellin.
  const r = spawnSync(komento, args, { cwd, env: ymparisto, encoding: 'utf8', shell: windows && komento !== process.execPath && komento !== 'git' && komento !== 'gitleaks', maxBuffer: 512 * 1024 * 1024 })
  return { koodi: r.error ? 127 : r.status ?? 1, tuloste: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` }
}

const tulos = (viestit, ok) => ({ koodi: viestit.length ? 1 : 0, tuloste: viestit.join('\n') || ok })

// Palauttaa poistettavat lokit: kaikki paitsi uusimmat `maara`. Nimet alkavat
// aikaleimalla, joten aakkosjärjestys on myös aikajärjestys.
export function vanhatLokit(nimet, maara = 20) {
  const lokit = nimet.filter((n) => n.endsWith('.log')).sort()
  return lokit.slice(0, Math.max(0, lokit.length - maara))
}

// Kansio voi näkyä yhtenä rivinä tai, jos siellä on myös commitoitu tiedosto, tiedostoittain.
const VALIAIKAISET = /(^|\/)(tmp|temp|coverage|test-results|playwright-report|screenshots)\/|\.(tmp|temp)$|(^|\/)(Screenshot |Screen Shot |Näyttökuva |Kuvakaappaus)[^/]*$/i

// Poistaa testien väliaikaiset tiedostot ja kuvakaappaukset. Vain gitin
// ohittamat, seuraamattomat polut: commitoitu tiedosto ei voi poistua. Ohitettu
// kansio, kuten node_modules/, näkyy gitille yhtenä rivinä, joten sen sisältöön
// ei kosketa. Palauttaa poistetut polut.
export function siivoa(kansio) {
  const rivit = execFileSync('git', ['ls-files', '-z', '-o', '-i', '--exclude-standard', '--directory'], { cwd: kansio, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const poistettavat = rivit.split('\0').filter((p) => p && VALIAIKAISET.test(p))
  for (const p of poistettavat) rmSync(join(kansio, p), { recursive: true, force: true })
  return poistettavat
}

export function nodeKelpaa(versio, vaadittu) {
  const paa = Number(versio.split('.')[0])
  return vaadittu == null ? paa >= 22 : paa === vaadittu
}

// git ohittaa hookin hiljaa, jos sillä ei ole suoritusoikeutta.
export function eiSuoritettavatHookit(kansio) {
  if (windows) return []
  return readdirSync(kansio).filter((n) => n !== 'yhteiset.sh').filter((n) => {
    try {
      accessSync(join(kansio, n), constants.X_OK)
      return false
    } catch {
      return true
    }
  })
}

function tarkistaYmparisto() {
  const viestit = []
  if (!nodeKelpaa(process.versions.node, PROJEKTI.nodeVersio)) {
    viestit.push(`Node ${process.versions.node}; projekti vaatii version ${PROJEKTI.nodeVersio ?? '22 tai uudemman'}`)
  }
  for (const [k, ohje] of [['gitleaks', 'brew install gitleaks; Windows: winget install Gitleaks.Gitleaks'], ...PROJEKTI.tyokalut]) {
    const r = spawnSync(k, ['--version'], { encoding: 'utf8', shell: windows, env: ymparisto })
    if (r.status !== 0) viestit.push(`${k} puuttuu (${ohje})`)
  }
  if (aja('git', ['config', '--get', 'core.hooksPath']).tuloste.trim() !== '.githooks') {
    viestit.push('git-hookit eivät ole käytössä (sh tools/asenna-hookit.sh; Windows: powershell -File tools/asenna-hookit.ps1)')
  }
  const hookit = eiSuoritettavatHookit(join(juuri, '.githooks'))
  if (hookit.length) viestit.push(`hookeilta puuttuu suoritusoikeus: ${hookit.join(', ')} (sh tools/asenna-hookit.sh)`)
  return tulos(viestit, 'Node, gitleaks, työkalut ja hookit kunnossa.')
}

// Täyttämättä jäänyt paikkamerkki tarkoittaa, että pakki on otettu käyttöön vain puoliksi.
export function loydaPaikkamerkit(kansio) {
  const agentit = join(kansio, '.claude', 'agents')
  const polut = ['CLAUDE.md', 'PLAN.md', 'WORKLOG.md', join('tools', 'projekti.mjs'),
    ...(existsSync(agentit) ? readdirSync(agentit).map((n) => join('.claude', 'agents', n)) : [])]
  return polut.flatMap((p) => {
    const t = join(kansio, p)
    if (!existsSync(t)) return []
    return [...readFileSync(t, 'utf8').matchAll(/\{\{[A-Z_]+\}\}/g)].map((m) => `${p}: ${m[0]}`)
  })
}

// Tyhjä tarkistuslista ei saa näyttää vihreältä, ellei syytä ole kirjoitettu.
export function omatMaaritelty(asetukset) {
  if (asetukset.tarkistukset.length) return { koodi: 0, tuloste: `${asetukset.tarkistukset.length} omaa tarkistusta.` }
  if (asetukset.eiOmiaTarkistuksia) return { koodi: 0, tuloste: `Ei omia tarkistuksia: ${asetukset.eiOmiaTarkistuksia}` }
  return { koodi: 1, tuloste: 'Projektin omia tarkistuksia (lint, käännös, testit) ei ole määritelty. Lisää ne tiedostoon tools/projekti.mjs (tarkistukset) tai kirjoita syy kohtaan eiOmiaTarkistuksia.' }
}

function lukitustiedostot() {
  const nimet = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum)$/
  return aja('git', ['ls-files', '-co', '--exclude-standard']).tuloste.split('\n').filter((p) => nimet.test(p))
}

function pakettitiedostot() {
  return aja('git', ['ls-files', '-co', '--exclude-standard']).tuloste.split('\n').filter((p) => /(^|\/)package\.json$/.test(p))
}

// npm audit vartioi korkeat haavoittuvuudet jokaisessa npm-paketissa. Ilman
// lukitustiedostoa tarkistus ei voisi toimia, joten se on punainen.
function npmAudit() {
  const paketit = pakettitiedostot()
  if (!paketit.length) return { koodi: 0, tila: 'EI SOVELLU', tuloste: 'Ei sovellu: repossa ei ole package.json-tiedostoa.' }
  const lukot = new Set(lukitustiedostot())
  const tulosteet = []
  for (const p of paketit) {
    const kansio = dirname(p)
    const lukko = kansio === '.' ? 'package-lock.json' : `${kansio}/package-lock.json`
    if (!lukot.has(lukko)) return { koodi: 1, tuloste: `${p}: lukitustiedosto puuttuu, joten haavoittuvuuksia ei voitu tarkistaa. Aja: npm install --package-lock-only --ignore-scripts` }
    const r = aja('npm', ['audit', '--omit=dev', '--audit-level=high'], join(juuri, kansio))
    tulosteet.push(`--- ${p}\n${r.tuloste}`)
    if (r.koodi !== 0) return { koodi: r.koodi, tuloste: tulosteet.join('\n') }
  }
  return { koodi: 0, tuloste: tulosteet.join('\n') }
}

// Vanha tietokanta ei näy tuloksessa: skanneri kertoo silti 0 löydöstä. Lataus
// vaatii verkon ja käyttäjän luvan, joten tämä on näkyvä varoitus eikä estä työtä.
const OSV_KANTA_ENINTAAN_PAIVAA = 14

export function osvKannanVaroitus(kanta, nyt = Date.now()) {
  let ladattu = NaN
  try {
    ladattu = Date.parse(JSON.parse(readFileSync(join(kanta, 'osv-db', 'SOURCE.json'), 'utf8')).downloaded)
  } catch {
    // Käsitellään alla: tuntematon ikä on yhtä huono kuin vanha.
  }
  if (Number.isNaN(ladattu)) return 'osv-scannerin tietokannan ikää ei voitu selvittää, joten tulos voi perustua vanhaan tietoon.'
  const paivia = Math.floor((nyt - ladattu) / 86400000)
  return paivia > OSV_KANTA_ENINTAAN_PAIVAA ? `osv-scannerin tietokanta on ${paivia} päivää vanha. Päivitä se SecurityScannerAppista, tai uudet haavoittuvuudet eivät näy.` : null
}

// Osa testeistä ei voi toimia kaikilla järjestelmillä. Ne eivät kaada ajoa, mutta
// niiden pitää näkyä, koska ne jäävät tällä koneella todistamatta.
export function ohitettujenVaroitus(tuloste) {
  const maara = Number(/^(?:#|ℹ) skipped (\d+)/m.exec(tuloste)?.[1] ?? 0)
  if (!maara) return null
  const nimet = [...tuloste.matchAll(/^\s*ok \d+ - (.+?) # SKIP/gm)].map((m) => m[1])
  return `${maara} turvatestiä ohitettiin tällä järjestelmällä${nimet.length ? `: ${nimet.join('; ')}` : ''}. Ne jäävät täällä todistamatta.`
}

// SecurityScannerAppin osv-scanner ja sen offline-tietokanta: pakettien nimet
// eivät lähde koneelta. Estää vain kriittiset (CVSS >= 9); npm audit vartioi
// korkeat. Muut löydökset näytetään lokissa.
function osvSkanneri() {
  const lukot = lukitustiedostot()
  if (!lukot.length) return { koodi: 0, tila: 'EI SOVELLU', tuloste: 'Ei sovellu: repossa ei ole lukitustiedostoja.' }
  if (PROJEKTI.eiSkanneria) return { koodi: 0, tila: 'POIS KÄYTÖSTÄ', varoitus: `SecurityScannerApp ja osv-scanner ovat pois käytöstä: ${PROJEKTI.eiSkanneria}`, tuloste: `Pois käytöstä projektin päätöksellä: ${PROJEKTI.eiSkanneria}` }
  const kanta = windows ? join(process.env.LOCALAPPDATA ?? '', 'SecurityScannerApp') : join(homedir(), '.securityscanner')
  const exe = join(kanta, 'bin', windows ? 'osv-scanner.exe' : 'osv-scanner')
  if (!existsSync(exe)) return { koodi: 1, tuloste: `osv-scanner puuttuu (${exe}). Asenna se SecurityScannerAppin ohjatulla käyttöönotolla.` }
  const r = spawnSync(exe, ['scan', 'source', '--offline', '--format', 'json', ...lukot.flatMap((l) => ['-L', l])], {
    cwd: juuri, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    env: { ...ymparisto, OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: join(kanta, 'osv-db') },
  })
  // Koodi 128 tarkoittaa, ettei paketteja löytynyt. Se kelpaa vain, jos jokainen
  // lukitustiedosto on luettu ja niissä kaikissa on 0 pakettia.
  const luetut = [...(r.stderr ?? '').matchAll(/found (\d+) packages?/g)].map((m) => Number(m[1]))
  if (r.status === 128 && luetut.length === lukot.length && luetut.every((n) => n === 0)) {
    return { koodi: 0, tuloste: 'Lukitustiedostoissa ei ole paketteja.' }
  }
  if (r.status !== 0 && r.status !== 1) return { koodi: 1, tuloste: `osv-scanner ei toiminut (koodi ${r.status}):\n${r.stderr}` }
  const rivit = []
  let kriittisia = 0
  for (const t of JSON.parse(r.stdout || '{"results":[]}').results ?? []) {
    for (const p of t.packages ?? []) {
      for (const ryhma of p.groups ?? []) {
        const vakavuus = Number(ryhma.max_severity) || 0
        if (vakavuus >= 9) kriittisia++
        rivit.push(`${p.package.name}@${p.package.version}: ${ryhma.ids.join(', ')} (CVSS ${ryhma.max_severity || '?'})`)
      }
    }
  }
  return { koodi: kriittisia ? 1 : 0, tuloste: `${rivit.length} tunnettua haavoittuvuutta, joista kriittisiä ${kriittisia}.\n${rivit.join('\n')}`, varoitus: osvKannanVaroitus(kanta) }
}

function skannerinVahti() {
  if (PROJEKTI.eiSkanneria) return { koodi: 0, tila: 'POIS KÄYTÖSTÄ', varoitus: `SecurityScannerApp ja osv-scanner ovat pois käytöstä: ${PROJEKTI.eiSkanneria}`, tuloste: `Pois käytöstä projektin päätöksellä: ${PROJEKTI.eiSkanneria}` }
  // --git-common-dir: myös linkitetyssä työpuussa (git worktree) vahti on pääkansion .git/hooks-hakemistossa.
  const gitKansio = aja('git', ['rev-parse', '--git-common-dir']).tuloste.trim()
  const vahti = resolve(juuri, gitKansio, 'hooks', 'pre-commit')
  const ok = existsSync(vahti) && readFileSync(vahti, 'utf8').includes('SecurityScannerApp git guard')
  return ok ? { koodi: 0, tuloste: 'Vahti on asennettu.' } : { koodi: 1, tuloste: 'SecurityScannerAppin vahti puuttuu tältä koneelta. Aja sh tools/asenna-hookit.sh (Windows: asenna-hookit.ps1), tai kirjoita syy tiedostoon tools/projekti.mjs (eiSkanneria).' }
}

function turvatestit() {
  const testit = readdirSync(join(juuri, 'tools', 'test')).filter((n) => n.endsWith('.test.mjs'))
  if (!testit.length) return { koodi: 1, tuloste: 'Turvasääntöjen testit puuttuvat (tools/test/).' }
  const r = aja(process.execPath, ['--test', ...testit.map((n) => join('tools', 'test', n))])
  return { ...r, varoitus: ohitettujenVaroitus(r.tuloste) }
}

const TARKISTUKSET = [
  ['Ympäristö (Node, työkalut, hookit)', tarkistaYmparisto],
  ['Paikkamerkit täytetty', () => {
    const loydot = loydaPaikkamerkit(juuri)
    return { koodi: loydot.length ? 1 : 0, tuloste: loydot.length ? `Täyttämättä:\n${loydot.join('\n')}` : 'Kaikki täytetty.' }
  }],
  ['Projektin omat tarkistukset määritelty', () => omatMaaritelty(PROJEKTI)],
  ['SecurityScannerAppin vahti', skannerinVahti],
  ['Salaisuudet: gitleaks, koko historia', () => (aja('git', ['rev-parse', '--verify', '-q', 'HEAD']).koodi === 0
    ? aja('gitleaks', ['git', '--redact', '--no-banner', '-c', '.gitleaks.toml', '.'])
    : { koodi: 0, tuloste: 'Ei vielä committeja; historia tyhjä.' })],
  ['Salaisuudet: gitleaks, työhakemisto', () => aja('gitleaks', ['dir', '--redact', '--no-banner', '-c', '.gitleaks.toml', '.'])],
  ['Turvasäännöt: kaikki tiedostot', () => aja(process.execPath, ['tools/turvasaannot.mjs', '--kaikki'])],
  ['Turvasäännöt: kaikkien committien historia', () => aja(process.execPath, ['tools/turvasaannot.mjs', '--historia'])],
  ['Turvasääntöjen ja hookien testit', turvatestit],
  ['Haavoittuvuudet: npm audit', npmAudit],
  ['Haavoittuvuudet: osv-scanner (offline)', osvSkanneri],
  ...PROJEKTI.tarkistukset.map((t) => [t.nimi, () => aja(t.komento[0], t.komento.slice(1)), t.hidas ? 'hidas' : '']),
]

// Ajaa tarkistukset ja palauttaa lopetuskoodin. Väliaikaiset tiedostot poistetaan
// vain täyden vihreän ajon jälkeen: punaisen tai vajaan ajon tiedostoja tarvitaan
// vian selvittämiseen. Epäonnistunut siivous ei ole vihreä.
export function suorita({ kerrat, nopea }, tarkistukset, kirjaa = () => {}, siivous = () => siivoa(juuri)) {
  let ohitettu = 0
  const varoitukset = new Set()
  for (let n = 1; n <= kerrat; n++) {
    console.log(`\n=== Kierros ${n}/${kerrat} ===`)
    kirjaa(`\n=== Kierros ${n}/${kerrat} ===`)
    for (const [nimi, tee, laji] of tarkistukset) {
      if (nopea && laji === 'hidas') {
        console.log(`  ${nimi} ... OHITETTU`)
        kirjaa(`\n--- ${nimi}: OHITETTU ---`)
        ohitettu++
        continue
      }
      const alku = Date.now()
      process.stdout.write(`  ${nimi} ... `)
      const { koodi, tuloste, varoitus, tila } = tee()
      if (varoitus) varoitukset.add(varoitus)
      const sek = Math.round((Date.now() - alku) / 1000)
      kirjaa(`\n--- ${nimi} (koodi ${koodi}, ${sek} s) ---\n${tuloste}`)
      console.log(koodi === 0 ? `${tila ?? 'vihreä'} (${sek} s)` : `PUNAINEN (${sek} s)`)
      if (koodi !== 0) {
        console.log(`\n${tuloste.trim().split('\n').slice(-40).join('\n')}`)
        console.log(`\nTULOS: PUNAINEN kierroksella ${n}/${kerrat}. Korjaa ja aja alusta uudelleen.`)
        kirjaa(`\nTULOS: PUNAINEN kierroksella ${n}/${kerrat}`)
        return 1
      }
    }
  }
  // Ohitettu tai vajaa ajo ei ole vihreä, vaikka mikään ei olisi kaatunut.
  for (const v of varoitukset) {
    console.log(`\nHuom: ${v}`)
    kirjaa(`\nHuom: ${v}`)
  }
  if (kerrat < 2 || nopea || ohitettu > 0) {
    const syy = [kerrat < 2 && 'vain yksi kierros', ohitettu > 0 && `${ohitettu} tarkistusta ohitettu`, nopea && !ohitettu && 'pikatila'].filter(Boolean).join(', ')
    console.log(`\nTULOS: KESKEN (${syy}). Ei riitä valmiiksi: aja ilman valitsimia.`)
    kirjaa(`\nTULOS: KESKEN (${syy})`)
    return 1
  }
  try {
    const poistetut = siivous()
    const viesti = poistetut.length ? `Väliaikaiset tiedostot poistettu:\n${poistetut.map((p) => `  ${p}`).join('\n')}` : 'Ei väliaikaisia tiedostoja poistettavaksi.'
    console.log(`\n${viesti}`)
    kirjaa(`\n${viesti}`)
  } catch (e) {
    console.log(`\nTULOS: PUNAINEN. Väliaikaisten tiedostojen poisto epäonnistui: ${e.message}`)
    kirjaa(`\nTULOS: PUNAINEN (siivous: ${e.message})`)
    return 1
  }
  console.log(`\nTULOS: VIHREÄ ${kerrat}/${kerrat}`)
  kirjaa(`\nTULOS: VIHREÄ ${kerrat}/${kerrat}`)
  return 0
}

function main() {
  const argv = process.argv.slice(2)
  const kerratKohta = argv.indexOf('--kerrat')
  const kerrat = kerratKohta >= 0 ? Number(argv[kerratKohta + 1]) || 2 : 2
  const nopea = argv.includes('--nopea')

  mkdirSync(join(juuri, '.tarkistus'), { recursive: true })
  for (const n of vanhatLokit(readdirSync(join(juuri, '.tarkistus')))) rmSync(join(juuri, '.tarkistus', n))
  const loki = join(juuri, '.tarkistus', `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`)
  console.log(`Tarkistus: ${kerrat} kierros${kerrat > 1 ? 'ta' : ''}${nopea ? ', ilman hitaita tarkistuksia' : ''}. Loki: ${loki}`)
  return suorita({ kerrat, nopea }, TARKISTUKSET, (teksti) => appendFileSync(loki, teksti + '\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = main()
