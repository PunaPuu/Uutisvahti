#!/usr/bin/env node
// Clauden PreToolUse-hook: estää Claudea lukemasta tai kirjoittamasta
// salaisuuksia, henkilötietoja ja vientitiedostoja sekä ajamasta komentoja,
// jotka veisivät koodia ulos tai ohittaisivat tarkistukset.
//
// Saa työkalukutsun JSONina stdinistä. Koodi 2 estää kutsun, ja stderr
// näytetään Claudelle syynä. Säännöt ovat samat kuin git-hookeissa
// (tools/turvasaannot.mjs, tools/projekti.mjs ja .gitleaks.toml), joten nämä
// tiedostot kopioidaan aina yhdessä.
//
// Claude Code tulkitsee muut virhekoodit kuin 2 varoitukseksi ja päästää kutsun
// läpi. Siksi kaikki odottamattomat virheet muutetaan koodiksi 2: vahti, joka
// ei voi tarkistaa, estää.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const juuri = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const YLEISET_KOMENNOT = [
  [/--no-verify\b|\bgit\b[^|;&]*\bcommit\b[^|;&]*\s-n\b/, 'tarkistuksia (git-hookit) ei ohiteta'],
  [/\.(csv|xlsx|xls|ods|pem|key|p12|pfx|jks|keystore)\b(?!["']?\s*(text|binary|eol))/i, 'komento viittaa vienti- tai avaintiedostoon'],
  [/(service-?account|-firebase-adminsdk-|credentials|client_secret)[^\s"'/\\]*\.json\b|\.secret\.local\b|\.runtimeconfig\.json\b/i, 'komento viittaa tunnistetiedostoon'],
  [/(^|[\s"'/\\])\.env(\.(?!example\b)[\w.-]+)?(\s|["']|$)/, 'komento viittaa .env-tiedostoon'],
]

const ETAREPO_KOMENNOT = [
  [/\bgit(\s+-[cC]\s+\S+)*\s+push\b/, 'tätä repoa ei pushata mihinkään'],
  [/\bgit(\s+-[cC]\s+\S+)*\s+remote\s+(add|set-url)\b/, 'etärepoja ei lisätä'],
  [/\bgh\s+\w/, 'GitHub-komentoja ei käytetä tässä projektissa'],
]

// Git ei välitä asetusten nimien kirjainkoosta, joten tämäkään ei saa välittää.
// Arvon lukeminen sallitaan, ja ainoa sallittu uusi arvo on täsmälleen .githooks.
function muuttaaHookienPolkua(komento) {
  const ilmanLukuja = komento.replace(/\bgit\s+config\s+(--local\s+)?--get\s+["']?core\.hookspath\b["']?/gi, '')
  return /\bcore\.hookspath\b(?!(\s*=\s*|\s+)["']?\.githooks["']?(\s|[;&|]|$))/i.test(ilmanLukuja)
}

function estä(syy) {
  process.stderr.write(`Turvavahti esti: ${syy}\n`)
  process.exit(2)
}

function suhteellinen(polku) {
  return relative(juuri, resolve(juuri, polku)).split('\\').join('/')
}

async function tarkista() {
  const { tarkistaPolku, henkilotietoRivi } = await import(pathToFileURL(join(juuri, 'tools', 'turvasaannot.mjs')).href)
  const { PROJEKTI } = await import(pathToFileURL(join(juuri, 'tools', 'projekti.mjs')).href)

  function tarkistaTeksti(polku, teksti) {
    if (!teksti) return
    const loydot = teksti.split(/\r?\n/).flatMap((r) => henkilotietoRivi(r).map(([s, k]) => `${s}: ${k}`))
    if (loydot.length && !/(^|\/)package-lock\.json$/.test(polku)) estä(`${polku}: ${[...new Set(loydot)].join('; ')}`)
    const gl = spawnSync('gitleaks', ['stdin', '--no-banner', '--redact', '--log-level', 'error', '-c', join(juuri, '.gitleaks.toml')], {
      input: teksti,
      encoding: 'utf8',
    })
    if (gl.error) estä('gitleaks puuttuu, joten kirjoitettavaa sisältöä ei voitu tarkistaa')
    if (gl.status !== 0) estä(`${polku}: sisällössä on salaisuudelta näyttävää, tai gitleaks ei voinut tarkistaa sitä`)
  }

  const syote = JSON.parse(readFileSync(0, 'utf8'))
  const nimi = syote.tool_name ?? ''
  const t = syote.tool_input ?? {}

  if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(nimi)) {
    const polku = suhteellinen(t.file_path ?? t.notebook_path ?? '')
    // Tiedostosäännöt: kokoa ei tarkisteta tässä (iso tiedosto saa olla luettavissa).
    const kielletyt = tarkistaPolku(polku, 0, null).filter((l) => l.saanto === 'kielletty-tiedosto')
    if (kielletyt.length) estä(`${polku}: ${kielletyt.map((l) => l.kuvaus).join('; ')}`)
    if (nimi === 'Write') tarkistaTeksti(polku, t.content)
    if (nimi === 'Edit') tarkistaTeksti(polku, t.new_string)
    if (nimi === 'MultiEdit') tarkistaTeksti(polku, (t.edits ?? []).map((e) => e.new_string).join('\n'))
    if (nimi === 'NotebookEdit') tarkistaTeksti(polku, t.new_source)
  }

  if (nimi === 'Bash' || nimi === 'PowerShell') {
    const komento = String(t.command ?? '')
    const kielletyt = [...YLEISET_KOMENNOT, ...(PROJEKTI.etarepoSallittu ? [] : ETAREPO_KOMENNOT), ...PROJEKTI.kielletytKomennot]
    for (const [malli, syy] of kielletyt) if (malli.test(komento)) estä(syy)
    if (muuttaaHookienPolkua(komento)) estä('git-hookien polkua ei vaihdeta pois .githooks-kansiosta')
    // Komennon mukana kirjoitettava sisältö (heredoc, echo) tarkistetaan samoin.
    tarkistaTeksti('komento', komento)
  }
}

try {
  await tarkista()
} catch (e) {
  estä(`vahti ei voinut tarkistaa kutsua (${e.message}). Tarkista, että tools/turvasaannot.mjs ja tools/projekti.mjs ovat kunnossa.`)
}
process.exit(0)
