#!/usr/bin/env node
// Tekee koko repon historiasta varmuuskopion yhteen tiedostoon (git bundle).
// post-merge-hook ajaa tämän jokaisen mainiin yhdistämisen jälkeen.
//
//   node tools/varmuuskopio.mjs
//
// Kohdekansio luetaan tämän koneen git-asetuksesta, ei repon tiedostoista:
//   git config projekti.varmuuskopio "/polku/kansioon"
//
// Bundle sisältää vain commitoidut tiedostot, joten samat turvatarkistukset
// suojaavat myös sitä. Uusimmat 10 säilytetään. Palautus:
//   git clone <tiedosto>.bundle projektin-nimi

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SAILYTETTAVAT = 10

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

export function aikaleima(paiva = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${paiva.getFullYear()}${p(paiva.getMonth() + 1)}${p(paiva.getDate())}-${p(paiva.getHours())}${p(paiva.getMinutes())}${p(paiva.getSeconds())}`
}

// Etuliite tulee kansion nimestä, jotta usean projektin varmuuskopiot voivat
// olla samassa kansiossa eikä säilytys poista toisen projektin tiedostoja.
export const etuliite = (kansio) => `${basename(kansio).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projekti'}-`

// Palauttaa poistettavat tiedostonimet: kaikki paitsi uusimmat `maara`.
export function vanhat(nimet, oma, maara = SAILYTETTAVAT) {
  const omat = nimet.filter((n) => new RegExp(`^${oma}\\d{8}-\\d{6}-[0-9a-f]+\\.bundle$`).test(n)).sort()
  return omat.slice(0, Math.max(0, omat.length - maara))
}

function main() {
  let kohde
  try {
    kohde = git('config', '--get', 'projekti.varmuuskopio')
  } catch {
    console.error('Varmuuskopion kohdetta ei ole asetettu. Aseta se:')
    console.error('  git config projekti.varmuuskopio "/polku/kansioon"')
    return 1
  }
  // Irrallinen levy: ei luoda kansiota sen tilalle, vaan kerrotaan asiasta.
  const asema = kohde.match(/^[A-Za-z]:[\\/]/)?.[0] ?? kohde.match(/^\/Volumes\/[^/]+/)?.[0]
  if (asema && !existsSync(asema)) {
    console.error(`Varmuuskopion levy ${asema} ei ole käytettävissä (verkkolevy tai muistitikku irti?).`)
    return 1
  }
  mkdirSync(kohde, { recursive: true })

  const oma = etuliite(git('rev-parse', '--show-toplevel'))
  const nimi = `${oma}${aikaleima()}-${git('rev-parse', '--short', 'HEAD')}.bundle`
  const valiaikainen = join(kohde, `${nimi}.kesken`)
  git('bundle', 'create', valiaikainen, '--all')
  git('bundle', 'verify', valiaikainen)
  renameSync(valiaikainen, join(kohde, nimi))

  const poistettavat = vanhat(readdirSync(kohde), oma)
  for (const n of poistettavat) rmSync(join(kohde, n))
  console.log(`Varmuuskopio tehty ja tarkistettu: ${join(kohde, nimi)}`)
  if (poistettavat.length) console.log(`Poistettiin ${poistettavat.length} vanhaa varmuuskopiota.`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main()
  } catch (e) {
    console.error(`Varmuuskopio epäonnistui: ${e.message}`)
    process.exitCode = 1
  }
}
