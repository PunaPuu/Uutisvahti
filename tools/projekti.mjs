// Tämän projektin omat turva-asetukset. Tämä on ainoa tools/-tiedosto, jota
// projektin alussa muokataan: turvasaannot.mjs, tarkista.mjs ja turvavahti.mjs
// lukevat asetukset täältä ja pysyvät samanlaisina projektista toiseen.
//
// Täytä paikkamerkit. `node tools/tarkista.mjs` on punainen, kunnes niitä ei ole.
// Projekti: Uutisvahti

export const PROJEKTI = {
  // Etärepo: false = paikallinen git, pre-push ja turvavahti estävät jokaisen
  // pushin. Muuta true vain, jos projektille on erikseen päätetty etärepo
  // (ohje: KAYTTOONOTTO.md). Sama päätös sanallisesti CLAUDE.md:ssä.
  // Uutisvahti: henkilökohtainen projekti, poikkeus: GitHub PunaPuu/Uutisvahti (julkinen, GitHub Pages).
  etarepoSallittu: true,

  // Henkilötiedot: oletuksena kaikki tarkistukset ovat päällä. Jos projekti ei
  // käsittele henkilötietoja, tarkistuksia voi kytkeä pois. Sama päätös
  // sanallisesti CLAUDE.md:ssä.
  henkilotiedot: {
    henkilotunnus: true,
    sahkoposti: true,
    puhelinnumero: true,
    // Projektin omat mallit, joita ei voi ohittaa kommentilla:
    // [tunnus, /malli/, 'kuvaus'], esim. vientitiedoston otsikkorivi.
    lisamallit: [],
  },

  // Verkkotunnukset, joiden osoitteet saavat näkyä repossa (esim. toimittajan
  // rajapintadokumentaatio). .test, .example, .invalid, .localhost, example.*
  // ja anthropic.com on sallittu aina.
  sallitutDomainit: [
    'microsoft.com',
    'azure.microsoft.com',
    'techcommunity.microsoft.com',
    'blogs.microsoft.com',
    'devblogs.microsoft.com',
    'ntfy.sh',
    'github.io',
    'github.com',
  ],

  // Tiedostonimet, jotka eivät saa päätyä repoon yleisten kieltojen lisäksi:
  // [/malli/, 'kuvaus'], esim. emulaattorin tallennettu data.
  kielletytNimet: [],

  // Kansiot, joissa kuvatiedostot saavat olla repossa, esim. ['public', 'docs/kuvat'].
  // Muualla kuvat estetään, koska tarkistukset eivät näe kuvien sisältöä ja
  // kuvakaappauksessa voi näkyä henkilötietoja. Sallitussa kansiossa oleva kuva
  // mainitaan commitissa, jotta joku katsoo sen.
  sallitutKuvakansiot: ['public/icons'],

  // Komennot, joita Claude ei saa ajaa: [/malli/, 'syy'], esim. julkaisukomento.
  kielletytKomennot: [
    [/\bgh\s+secret\s+set\b/, 'NTFY_TOPIC-salaisuuden asettaa käyttäjä itse, jotta arvo ei kulje Clauden kautta'],
    [/\bgh\s+repo\s+(delete|rename|archive)\b/, 'repon poisto, nimen vaihto tai arkistointi vain käyttäjän tekemänä'],
  ],

  // Koodisäännöt. Rivin voi ohittaa kommentilla "turva-ok: <syy>". Jokaisella
  // säännöllä on oltava esimerkit: tools/test/projekti.test.mjs ajaa ne, joten
  // säännön aukko näkyy kaatuvana testinä.
  koodisaannot: [
    {
      id: 'vaarallinen-html',
      polut: /^(?!tools\/|\.claude\/).*\.(ts|tsx|js|jsx|mjs|html)$/,
      malli: /dangerouslySetInnerHTML|\.(innerHTML|outerHTML)\s*=|\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/,
      kuvaus: 'vaarallinen HTML tai koodin suoritus (XSS-riski)',
      esimerkkiPolku: 'src/nakyma.tsx',
      osuu: 'el.innerHTML = syote',
      eiOsu: 'el.textContent = syote',
    },
    {
      id: 'salaamaton-url',
      polut: /^(src|public|config)\/.*\.(mjs|js|json|html)$/,
      malli: /['"`]http:\/\/(?!localhost|127\.0\.0\.1)/,
      kuvaus: 'syötteiden ja push-ilmoitusten osoitteiden on oltava https://',
      esimerkkiPolku: 'src/feeds.mjs',
      osuu: "url: 'http://feeds.example/rss'",
      eiOsu: "url: 'https://feeds.example/rss'",
    },
    {
      id: 'kiinnittamaton-action',
      polut: /^\.github\/workflows\/.*\.ya?ml$/,
      malli: /uses:\s*[^\s#]+@(?![0-9a-f]{40}\b)/,
      kuvaus: 'GitHub Actions -toiminnot on kiinnitettävä commitin SHA:han, ei tagiin',
      esimerkkiPolku: '.github/workflows/paivitys.yml',
      osuu: '      - uses: actions/checkout@v4',
      eiOsu: '      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4',
    },
  ],

  // Paketit, joiden asennusskripti on tarkistettu: { nimi: 'perustelu' }.
  // Riippuvuudet asennetaan aina komennolla: npm ci --ignore-scripts
  sallitutAsennusskriptit: {
    fsevents: 'vain macOS:n tiedostojen seuranta',
  },

  // Projektin omat tarkistukset (lint, käännös, testit). `node tools/tarkista.mjs`
  // ajaa ne turvatarkistusten jälkeen. Tyhjä lista on punainen, ellei
  // eiOmiaTarkistuksia kerro syytä. hidas: true jää pois --nopea-ajosta.
  // Esimerkki: { nimi: 'Testit', komento: ['npm', 'test'], hidas: true }
  tarkistukset: [
    { nimi: 'Syntax check (node --check)', komento: ['node', 'scripts/check-syntax.mjs'] },
    { nimi: 'Unit tests (node --test)', komento: ['npm', 'test'], hidas: true },
    { nimi: 'Offline build from fixtures', komento: ['node', 'src/build.mjs', '--offline', '--out', 'tmp/site'], hidas: true },
  ],
  eiOmiaTarkistuksia: null,

  // Node-pääversio, esim. 22. null = kelpaa 22 tai uudempi.
  nodeVersio: 22,

  // Muut pakolliset työkalut: [['java', 'asennusohje'], ...]. Nämä tarkistetaan
  // komennolla "<nimi> --version".
  tyokalut: [],

  // SecurityScannerAppin git-vahti ja osv-scanner ovat pakollisia. Jos ne on
  // päätetty jättää pois, kirjoita syy tähän; syy näkyy jokaisessa ajossa.
  eiSkanneria: null,
}
