// Tarkistaa projektin omat asetukset (tools/projekti.mjs). Jokaisen koodisäännön
// esimerkit ajetaan oikean säännön läpi, joten säännön aukko näkyy kaatuvana testinä.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PROJEKTI } from '../projekti.mjs'
import { tarkistaSisalto } from '../turvasaannot.mjs'

describe('projektin koodisäännöt', () => {
  for (const s of PROJEKTI.koodisaannot) {
    test(`${s.id}: esimerkit ovat olemassa ja toimivat`, () => {
      for (const k of ['id', 'polut', 'malli', 'kuvaus', 'esimerkkiPolku', 'osuu', 'eiOsu']) assert.ok(s[k], `kenttä ${k} puuttuu`)
      const saannot = (teksti) => tarkistaSisalto(s.esimerkkiPolku, teksti).map((l) => l.saanto)
      assert.ok(saannot(s.osuu).includes(s.id), `sääntö ei osunut riviin: ${s.osuu}`)
      assert.ok(!saannot(s.eiOsu).includes(s.id), `sääntö osui riviin: ${s.eiOsu}`)
    })
  }
})

describe('projektin kuvakansiot', () => {
  test('kansiot ovat repon sisäisiä, eikä repon juurta sallita', () => {
    for (const k of PROJEKTI.sallitutKuvakansiot) {
      assert.ok(typeof k === 'string' && k.length > 0 && !k.startsWith('/') && !k.includes('..') && k !== '.', String(k))
    }
  })
})

describe('projektin tarkistukset', () => {
  test('jokaisella tarkistuksella on nimi ja komento', () => {
    for (const t of PROJEKTI.tarkistukset) {
      assert.ok(t.nimi)
      assert.ok(Array.isArray(t.komento) && t.komento.length > 0, t.nimi)
    }
  })
})
