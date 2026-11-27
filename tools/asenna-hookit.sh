#!/bin/sh
# Ottaa projektin git-hookit käyttöön Macissa tai Linuxissa. Aja kerran
# kopioinnin tai kloonauksen jälkeen, sillä hookit eivät tule käyttöön pelkällä
# kopioinnilla:
#
#   sh tools/asenna-hookit.sh [polku/Security_Scanner.py]
#
# Skannerin polun voi antaa myös ympäristömuuttujassa SECURITY_SCANNER_PATH.
# (Windowsissa sama asia tehdään tiedostolla tools/asenna-hookit.ps1.)
#
# 1. Luo git-repon tähän kansioon, jos sitä ei vielä ole (haara main, ei etärepoa).
# 2. Tarkistaa, että gitleaks ja Node.js löytyvät (ilman niitä hookit estävät kaiken).
# 3. Asentaa SecurityScannerAppin git-vahdin hakemistoon .git/hooks, jos sovellus
#    löytyy. Vahti on toinen suojakerros, ja projektin hookit kutsuvat sitä.
# 4. Asettaa core.hooksPath = .githooks, jolloin projektin omat hookit ovat käytössä.
set -eu

skanneri="${1:-${SECURITY_SCANNER_PATH:-$HOME/Documents/Claude Project/SecurityScannerApp/Security_Scanner.py}}"

# Projektin juuri on tämän skriptin yläkansio. Polkua ei kysytä gitiltä, koska
# yläpuolella oleva toinen repo saisi silloin hookit väärään paikkaan.
cd "$(dirname "$0")/.."

tarkista() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "PUUTTUU: $1. $2" >&2
    exit 1
  fi
  echo "OK: $1 ($(command -v "$1"))"
}

tarkista git 'Asenna: xcode-select --install'
tarkista gitleaks 'Asenna: brew install gitleaks'
tarkista node 'Asenna Node.js 22: brew install node@22'

if [ ! -e .git ]; then
  git init -q -b main
  echo 'OK: uusi git-repo luotu (haara main, ei etärepoa)'
fi

# Kopioinnissa (USB-tikku, zip) suoritusoikeudet voivat kadota, ja git ohittaa
# silloin hookin hiljaa.
chmod +x .githooks/*

# SecurityScannerAppin asennin kirjoittaa hakemistoon, jonka git ilmoittaa
# hookien paikaksi. Poistetaan hooksPath hetkeksi, jotta vahti menee
# hakemistoon .git/hooks eikä repoon kuuluvaan .githooks-kansioon.
vahti="$(git rev-parse --git-common-dir)/hooks/pre-commit"
if [ -f "$vahti" ] && grep -q 'SecurityScannerApp git guard' "$vahti"; then
  echo 'OK: SecurityScannerAppin vahti on jo asennettu (.git/hooks)'
elif [ -f "$skanneri" ] && command -v python3 >/dev/null 2>&1; then
  git config --unset core.hooksPath || true
  if ! python3 "$skanneri" --install-git-hook "$(pwd)" --yes; then
    git config core.hooksPath .githooks
    echo 'SecurityScannerAppin vahdin asennus epäonnistui.' >&2
    exit 1
  fi
else
  echo "Huom: SecurityScannerAppia ei löytynyt ($skanneri). Toinen suojakerros jää pois, ja node tools/tarkista.mjs on punainen, kunnes se on asennettu tai tools/projekti.mjs kertoo syyn (eiSkanneria)." >&2
fi

git config core.hooksPath .githooks
echo 'OK: core.hooksPath = .githooks'
echo ''
echo 'Hookit ovat käytössä: pre-commit, commit-msg, pre-merge-commit, pre-push (estää pushit), post-merge (varmuuskopio).'
if ! git config --get projekti.varmuuskopio >/dev/null 2>&1; then
  echo 'Aseta vielä varmuuskopioiden kohde: git config projekti.varmuuskopio "/polku/kansioon"'
fi
