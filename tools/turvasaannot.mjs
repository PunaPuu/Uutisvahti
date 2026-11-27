#!/usr/bin/env node
// Projektin tietoturvasäännöt: asiat, joita gitleaks ei osaa tarkistaa.
// Projektikohtaiset asetukset ovat tiedostossa tools/projekti.mjs.
//
//   node tools/turvasaannot.mjs --staged       commitoitavat muutokset (pre-commit)
//   node tools/turvasaannot.mjs --kaikki       kaikki repoon kuuluvat tiedostot
//   node tools/turvasaannot.mjs --historia     kaikkien committien lisätyt rivit
//   node tools/turvasaannot.mjs --viesti FILE  commit-viesti (commit-msg)
//   node tools/turvasaannot.mjs --push         pre-push: onko etärepo sallittu
//
// Palauttaa koodin 1, jos jokin sääntö löytää jotain. Koodisäännöt voi ohittaa
// yksittäiseltä riviltä kommentilla "turva-ok: <syy>" samalla tai edellisellä
// rivillä. Salaisuus-, henkilötieto- ja tiedostosääntöjä ei voi ohittaa.

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { PROJEKTI } from './projekti.mjs'

const MAKSIMIKOKO = 1024 * 1024

// ---------------------------------------------------------------------------
// Henkilötiedot
// ---------------------------------------------------------------------------

const HETU = /\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})([-+A-FU-Y])(\d{3})([0-9A-FHJ-NPR-Y])\b/g
const HETU_MERKIT = '0123456789' + 'ABCDEFHJKLMNPRSTUVWXY'

export function hetuKelpaa(pp, kk, vv, numero, tarkiste) {
  return HETU_MERKIT[Number(`${pp}${kk}${vv}${numero}`) % 31] === tarkiste
}

const SAHKOPOSTI = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g

// Keksityt ja varatut verkkotunnukset sekä commit-viestien allekirjoitus.
const SALLITUT_DOMAINIT = [
  /(^|\.)test$/i, /(^|\.)example$/i, /(^|\.)invalid$/i, /(^|\.)localhost$/i,
  /(^|\.)example\.(com|org|net)$/i,
  /^anthropic\.com$/i,
]

// Paketin versiomerkinnät näyttävät osoitteilta (esim. foo@1.2.3), mutta
// niissä domainin viimeinen osa on numero.
const sallittuDomain = (d, omat) => /\.\d+$/.test(d) || /^\d/.test(d) || [...SALLITUT_DOMAINIT, ...omat].some((r) => r.test(d))

// Suomalaiset matkapuhelinnumerot (+358 4x / 50, tai 04x / 050).
const PUHELIN = /(?:\+358|\b00358)[\s-]?\(?0?\)?(?:4\d|50)[\s-]?\d{3}[\s-]?\d{3,4}\b|\b0(?:4\d|50)[\s-]?\d{3}[\s-]?\d{3,4}\b/g

// Asetukset voi antaa parametrina, jotta testit eivät riipu projektin valinnoista.
export function henkilotietoRivi(rivi, asetukset = PROJEKTI) {
  const h = asetukset.henkilotiedot
  const loydot = []
  if (h.henkilotunnus) {
    for (const m of rivi.matchAll(HETU)) {
      if (hetuKelpaa(m[1], m[2], m[3], m[5], m[6])) loydot.push(['henkilotunnus', 'henkilötunnus (tarkiste täsmää)'])
    }
  }
  if (h.sahkoposti) {
    for (const m of rivi.matchAll(SAHKOPOSTI)) {
      if (!sallittuDomain(m[1], asetukset.sallitutDomainit)) loydot.push(['sahkoposti', `sähköpostiosoite oikeassa verkkotunnuksessa (@${m[1]})`])
    }
  }
  if (h.puhelinnumero) {
    for (const _ of rivi.matchAll(PUHELIN)) loydot.push(['puhelinnumero', 'suomalainen matkapuhelinnumero'])
  }
  for (const [tunnus, malli, kuvaus] of h.lisamallit) {
    if (malli.test(rivi)) loydot.push([tunnus, kuvaus])
  }
  return loydot
}

// Generoiduissa lukitustiedostoissa on pakettien tekijöiden osoitteita, jotka
// eivät ole tämän projektin henkilötietoja.
const ilmanSahkopostisaantoa = (polku) => /(^|\/)package-lock\.json$/.test(polku)

// ---------------------------------------------------------------------------
// Tiedostot, jotka eivät saa päätyä repoon
// ---------------------------------------------------------------------------

const KIELLETYT_NIMET = [
  [/(^|\/)\.env(\..+)?$/i, 'ympäristömuuttujatiedosto'],
  [/\.(pem|key|p12|pfx|jks|keystore)$/i, 'avain- tai varmennetiedosto'],
  [/(serviceaccount|service-account|firebase-adminsdk)[^/]*\.json$/i, 'palvelutilin avain'],
  [/(^|\/)(credentials|client_secret)[^/]*\.json$/i, 'tunnistetiedosto'],
  [/(^|\/)(\.runtimeconfig\.json|\.secret\.local)$/i, 'salaisuustiedosto'],
  [/(^|\/)\.npmrc$/, 'npm-asetustiedosto voi sisältää kirjautumistunnisteen; asetukset annetaan komentorivillä'],
  [/\.(xlsx|xls|ods)$/i, 'taulukkotiedosto (voi sisältää henkilötietoja)'],
]

const KUVA = /\.(png|jpe?g|gif|bmp|tiff?|webp|heic)$/i

export const onKuva = (polku) => KUVA.test(polku)

export function sallitussaKuvakansiossa(polku, asetukset = PROJEKTI) {
  return asetukset.sallitutKuvakansiot.some((k) => polku.startsWith(k.endsWith('/') ? k : `${k}/`))
}

// sisalto === null tarkoittaa, että sisältöä ei ole saatavilla (historia,
// turvavahti): silloin CSV:stä voi päätellä vain kansion.
export function tarkistaPolku(polku, koko, sisalto, asetukset = PROJEKTI) {
  const loydot = []
  const env = /(^|\/)\.env\.example$/i.test(polku)
  for (const [malli, kuvaus] of [...KIELLETYT_NIMET, ...asetukset.kielletytNimet]) {
    if (malli.test(polku) && !env) loydot.push({ saanto: 'kielletty-tiedosto', rivi: 0, kuvaus })
  }
  if (env && sisalto != null) {
    sisalto.split('\n').forEach((r, i) => {
      if (/^\s*[A-Z0-9_]+\s*=\s*\S/.test(r)) {
        loydot.push({ saanto: 'env-esimerkki', rivi: i + 1, kuvaus: '.env.example sisältää arvon; jätä arvot tyhjiksi' })
      }
    })
  }
  if (/\.csv$/i.test(polku)) {
    const keksitty = polku.startsWith('testidata/') && (sisalto == null || /KEKSITTY/.test(sisalto.split('\n')[0]))
    if (!keksitty) {
      loydot.push({ saanto: 'kielletty-tiedosto', rivi: 0, kuvaus: 'CSV-tiedosto (sallittu vain testidata/-kansiossa, ensimmäisellä rivillä KEKSITTY)' })
    }
  }
  if (onKuva(polku) && !sallitussaKuvakansiossa(polku, asetukset)) {
    loydot.push({ saanto: 'kuvatiedosto', rivi: 0, kuvaus: 'kuvan sisältöä ei voi tarkistaa; siirrä kuva pois repon seurannasta tai lisää kansio kohtaan sallitutKuvakansiot (tools/projekti.mjs)' })
  }
  if (koko > MAKSIMIKOKO) loydot.push({ saanto: 'iso-tiedosto', rivi: 0, kuvaus: `tiedosto on yli 1 Mt (${Math.round(koko / 1024)} kt)` })
  return loydot
}

// ---------------------------------------------------------------------------
// Pakettien asennusskriptit
// ---------------------------------------------------------------------------

// Asennusskripti ajaa paketin koodia jo asennuksen aikana (yleinen
// toimitusketjuhyökkäyksen reitti). Riippuvuudet asennetaan komennolla
// "npm ci --ignore-scripts", ja tämä sääntö estää uudet skriptilliset paketit.
export function tarkistaLukitus(teksti, asetukset = PROJEKTI) {
  let lukitus
  try {
    lukitus = JSON.parse(teksti)
  } catch {
    return [{ saanto: 'asennusskripti', rivi: 0, kuvaus: 'lukitustiedosto ei ole kelvollista JSONia' }]
  }
  return Object.entries(lukitus.packages ?? {})
    .filter(([, p]) => p.hasInstallScript)
    .map(([polku]) => polku.replace(/^.*node_modules\//, ''))
    .filter((nimi) => !(nimi in asetukset.sallitutAsennusskriptit))
    .map((nimi) => ({
      saanto: 'asennusskripti',
      rivi: 0,
      kuvaus: `paketilla ${nimi} on asennusskripti; tarkista paketti ja lisää se tarvittaessa sallitutAsennusskriptit-listaan perusteluineen (tools/projekti.mjs)`,
    }))
}

// ---------------------------------------------------------------------------
// Koodisäännöt (määritellään tiedostossa tools/projekti.mjs)
// ---------------------------------------------------------------------------

const ohitetut = []

function koodiSaannot(polku, rivit, asetukset) {
  const loydot = []
  for (const s of asetukset.koodisaannot) {
    if (!s.polut.test(polku)) continue
    rivit.forEach((r, i) => {
      if (s.malli.test(r)) loydot.push({ saanto: s.id, rivi: i + 1, kuvaus: s.kuvaus })
    })
  }
  // Ohitukset: "turva-ok: syy" samalla tai edellisellä rivillä.
  return loydot.filter((l) => {
    const ohitus = (n) => n >= 0 && /turva-ok:\s*\S/.test(rivit[n] ?? '')
    if (ohitus(l.rivi - 1) || ohitus(l.rivi - 2)) {
      ohitetut.push({ polku, ...l })
      return false
    }
    return true
  })
}

export function tarkistaSisalto(polku, teksti, asetukset = PROJEKTI) {
  const rivit = teksti.split(/\r?\n/)
  const loydot = []
  rivit.forEach((r, i) => {
    for (const [saanto, kuvaus] of henkilotietoRivi(r, asetukset)) {
      if (saanto === 'sahkoposti' && ilmanSahkopostisaantoa(polku)) continue
      loydot.push({ saanto, rivi: i + 1, kuvaus })
    }
  })
  return [...loydot, ...koodiSaannot(polku, rivit, asetukset)]
}

// ---------------------------------------------------------------------------
// Tiedostojen haku gitistä
// ---------------------------------------------------------------------------

const git = (args, opts = {}) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024, ...opts })
const onBinaari = (puskuri) => puskuri.subarray(0, 8000).includes(0)

function tarkistaTiedosto(polku, puskuri) {
  const binaari = onBinaari(puskuri)
  const teksti = binaari ? '' : puskuri.toString('utf8')
  const loydot = tarkistaPolku(polku, puskuri.length, teksti)
  if (!binaari) loydot.push(...tarkistaSisalto(polku, teksti))
  if (/(^|\/)package-lock\.json$/.test(polku)) loydot.push(...tarkistaLukitus(teksti))
  return loydot.map((l) => ({ polku, ...l }))
}

function staged() {
  const polut = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).toString().split('\0').filter(Boolean)
  for (const p of polut) {
    if (onKuva(p) && sallitussaKuvakansiossa(p)) console.error(`Huom: ${p} on kuva, jonka sisältöä ei tarkisteta. Katso, ettei siinä näy henkilötietoja tai salaisuuksia.`)
  }
  return polut.flatMap((p) => tarkistaTiedosto(p, git(['show', `:${p}`])))
}

function kaikki() {
  const polut = git(['ls-files', '-z', '-co', '--exclude-standard']).toString().split('\0').filter(Boolean)
  return polut.flatMap((p) => {
    try {
      statSync(p)
    } catch {
      return [] // poistettu työhakemistosta mutta vielä indeksissä
    }
    return tarkistaTiedosto(p, readFileSync(p))
  })
}

// Historiasta tarkistetaan tiedostonimet ja jokaisen commitin lisäämät rivit
// henkilötietojen varalta. Näin myös --no-verify-commit jää kiinni.
function historia() {
  try {
    git(['rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' })
  } catch {
    return []
  }
  // core.quotePath=false: muuten ääkkösellinen polku tulisi lainausmerkeissä ja koodattuna.
  const loki = git(['-c', 'core.quotePath=false', 'log', '--all', '-p', '--no-color', '--no-ext-diff', '--unified=0', '--format=commit %h']).toString('utf8')
  const loydot = []
  let commit = ''
  let polku = ''
  let rivi = 0
  const tarkistaNimi = (p) => {
    for (const l of tarkistaPolku(p, 0, null)) loydot.push({ polku: `${commit}:${p}`, ...l })
  }
  for (const r of loki.split('\n')) {
    if (r.startsWith('commit ')) commit = r.slice(7)
    else if (r.startsWith('+++ ')) {
      // Git lisää välilyönnin sisältävän polun perään sarkaimen.
      polku = r.startsWith('+++ b/') ? r.slice(6).replace(/\t$/, '') : ''
      if (polku) tarkistaNimi(polku)
    } else if (r.startsWith('Binary files ')) {
      // Binääritiedostolla, kuten kuvalla, ei ole +++-riviä.
      polku = ''
      const m = / and "?b\/(.+?)"? differ$/.exec(r)
      if (m) tarkistaNimi(m[1])
    } else if (r.startsWith('@@')) {
      rivi = Number(/\+(\d+)/.exec(r)?.[1] ?? 0)
    } else if (r.startsWith('+') && polku) {
      for (const [saanto, kuvaus] of henkilotietoRivi(r.slice(1))) {
        if (saanto === 'sahkoposti' && ilmanSahkopostisaantoa(polku)) continue
        loydot.push({ polku: `${commit}:${polku}`, saanto, rivi, kuvaus })
      }
      rivi++
    }
  }
  return loydot
}

function viesti(tiedosto) {
  const rivit = readFileSync(tiedosto, 'utf8').split(/\r?\n/).filter((r) => !r.startsWith('#'))
  return rivit.flatMap((r, i) => henkilotietoRivi(r).map(([saanto, kuvaus]) => ({ polku: 'commit-viesti', saanto, rivi: i + 1, kuvaus })))
}

// ---------------------------------------------------------------------------

function main(argv) {
  const tila = argv[0]
  if (tila === '--push') {
    if (PROJEKTI.etarepoSallittu) return 0
    console.error('\nESTETTY: tätä repoa ei pushata mihinkään (tools/projekti.mjs: etarepoSallittu). Varmuuskopio: node tools/varmuuskopio.mjs\n')
    return 1
  }
  let loydot
  if (tila === '--staged') loydot = staged()
  else if (tila === '--kaikki') loydot = kaikki()
  else if (tila === '--historia') loydot = historia()
  else if (tila === '--viesti' && argv[1]) loydot = viesti(argv[1])
  else {
    console.error('Käyttö: node tools/turvasaannot.mjs --staged | --kaikki | --historia | --viesti TIEDOSTO | --push')
    return 2
  }
  for (const o of ohitetut) console.log(`ohitettu  [${o.saanto}] ${o.polku}:${o.rivi}`)
  if (loydot.length === 0) {
    console.log(`Turvasäännöt (${tila.slice(2)}): ei löydöksiä.`)
    return 0
  }
  console.error(`Turvasäännöt (${tila.slice(2)}): ${loydot.length} löydöstä:`)
  for (const l of loydot) console.error(`  [${l.saanto}] ${l.polku}${l.rivi ? ':' + l.rivi : ''}  ${l.kuvaus}`)
  console.error('Korjaa löydökset. Henkilötietoja, salaisuuksia ja kiellettyjä tiedostoja ei voi ohittaa.')
  return 1
}

// realpathSync: import.meta.url on aina oikea polku, argv[1] voi kulkea symlinkin
// kautta (macOSissa esim. /var -> /private/var). Ilman tätä tarkistus jäisi
// hiljaa ajamatta ja palauttaisi koodin 0.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
