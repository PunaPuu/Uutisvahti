# Hookien yhteiset apufunktiot. Ladataan hookeista komennolla ". yhteiset.sh".
# Hookit ajetaan aina repon juuresta.

virhe() {
  echo "" >&2
  echo "ESTETTY: $*" >&2
  echo "" >&2
  exit 1
}

# Tarkistukset eivät saa ohittua hiljaa: jos työkalu puuttuu, commit estetään.
vaadi_tyokalut() {
  command -v gitleaks >/dev/null 2>&1 \
    || virhe "gitleaks puuttuu, joten salaisuuksia ei voitu tarkistaa. Asenna: brew install gitleaks (Windows: winget install Gitleaks.Gitleaks)"
  command -v node >/dev/null 2>&1 \
    || virhe "Node.js puuttuu, joten projektin turvasääntöjä ei voitu tarkistaa."
}

# Lisättävien muutosten tarkistus: salaisuudet ja projektin säännöt.
tarkista_lisattavat() {
  echo "Turvatarkistus: gitleaks..." >&2
  gitleaks git --pre-commit --staged --redact --no-banner --log-level warn -c .gitleaks.toml \
    || virhe "gitleaks löysi salaisuudelta näyttävää. Poista se muutoksista (git restore --staged <tiedosto>)."

  node tools/turvasaannot.mjs --staged \
    || virhe "projektin turvasäännöt löysivät ongelmia (lista yllä)."

  tarkista_projekti
}

# Projektin omat nopeat commit-tarkistukset, esimerkiksi lint muuttuneille
# tiedostoille. Puuttuva työkalu estää commitin, ei ohita tarkistusta:
#
#   tiedostot=$(git diff --cached --name-only --diff-filter=ACMR -- 'src/*.ts')
#   if [ -n "$tiedostot" ]; then
#     [ -x node_modules/.bin/oxlint ] || virhe "oxlint puuttuu. Aja: npm ci --ignore-scripts"
#     node_modules/.bin/oxlint $tiedostot >&2 || virhe "oxlint löysi virheitä."
#   fi
tarkista_projekti() {
  tiedostot=$(git diff --cached --name-only --diff-filter=ACMR -- 'src/*.mjs' 'scripts/*.mjs' 'test/*.mjs' 'public/*.js')
  if [ -n "$tiedostot" ]; then
    node scripts/check-syntax.mjs >&2 || virhe "node --check löysi syntaksivirheitä."
  fi
}

# Toinen suojakerros: SecurityScannerAppin git-vahti, joka on asennettu koneelle
# paikallisesti hakemistoon .git/hooks (ei repoon). Jos sitä ei ole, commit menee
# läpi varoituksella, ja node tools/tarkista.mjs on punainen.
ketjuta_skanneriin() {
  hook="$1"
  shift
  # --git-common-dir: myös linkitetyssä työpuussa (git worktree) vahti on pääkansion .git/hooks-hakemistossa.
  polku="$(git rev-parse --git-common-dir)/hooks/$hook"
  if [ -f "$polku" ] && grep -q "SecurityScannerApp git guard" "$polku"; then
    sh "$polku" "$@" || virhe "SecurityScannerAppin vahti esti commitin (katso yllä)."
  else
    echo "Huom: SecurityScannerAppin vahti ei ole asennettu tälle koneelle (toinen suojakerros puuttuu)." >&2
    echo "      Asennus: sh tools/asenna-hookit.sh (Windows: powershell -File tools/asenna-hookit.ps1)" >&2
  fi
}
