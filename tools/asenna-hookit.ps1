# Ottaa projektin git-hookit käyttöön Windowsissa. Aja kerran kopioinnin tai
# kloonauksen jälkeen, sillä hookit eivät tule käyttöön pelkällä kopioinnilla:
#   powershell -ExecutionPolicy Bypass -File tools\asenna-hookit.ps1
#
# Skannerin polun voi antaa parametrilla -Skanneri tai ympäristömuuttujassa
# SECURITY_SCANNER_PATH.
#
# 1. Luo git-repon tähän kansioon, jos sitä ei vielä ole (haara main, ei etärepoa).
# 2. Tarkistaa, että gitleaks ja Node.js löytyvät (ilman niitä hookit estävät kaiken).
# 3. Asentaa SecurityScannerAppin git-vahdin hakemistoon .git\hooks, jos sovellus
#    löytyy. Vahti on toinen suojakerros, ja projektin hookit kutsuvat sitä.
# 4. Asettaa core.hooksPath = .githooks, jolloin projektin omat hookit ovat käytössä.

param(
    [string]$Skanneri = $(if ($env:SECURITY_SCANNER_PATH) { $env:SECURITY_SCANNER_PATH } else { "$env:USERPROFILE\Documents\Claude Project\SecurityScannerApp\Security_Scanner.py" })
)

$ErrorActionPreference = 'Stop'

# Projektin juuri on tämän skriptin yläkansio. Polkua ei kysytä gitiltä, koska
# yläpuolella oleva toinen repo saisi silloin hookit väärään paikkaan.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

function Tarkista($nimi, $ohje) {
    if (-not (Get-Command $nimi -ErrorAction SilentlyContinue)) {
        Write-Host "PUUTTUU: $nimi. $ohje" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK: $nimi ($((Get-Command $nimi).Source))"
}

Tarkista 'git' 'Asenna: winget install Git.Git'
Tarkista 'gitleaks' 'Asenna: winget install Gitleaks.Gitleaks'
Tarkista 'node' 'Asenna Node.js 22 (fnm: winget install Schniz.fnm; fnm install 22)'

if (-not (Test-Path '.git')) {
    git init -q -b main
    Write-Host 'OK: uusi git-repo luotu (haara main, ei etärepoa)'
}

# SecurityScannerAppin asennin kirjoittaa hakemistoon, jonka git ilmoittaa
# hookien paikaksi. Poistetaan hooksPath hetkeksi, jotta vahti menee
# hakemistoon .git\hooks eikä repoon kuuluvaan .githooks-kansioon.
$vahti = Join-Path (git rev-parse --git-common-dir).Trim() 'hooks\pre-commit'
if ((Test-Path $vahti) -and (Select-String -Path $vahti -Pattern 'SecurityScannerApp git guard' -Quiet)) {
    Write-Host 'OK: SecurityScannerAppin vahti on jo asennettu (.git\hooks)'
} elseif ((Test-Path $Skanneri) -and (Get-Command py -ErrorAction SilentlyContinue)) {
    # git palauttaa koodin 5, jos asetusta ei ole; se ei ole virhe.
    git config --unset core.hooksPath 2>$null
    py $Skanneri --install-git-hook $repo --yes
    if ($LASTEXITCODE -ne 0) {
        git config core.hooksPath .githooks
        Write-Host 'SecurityScannerAppin vahdin asennus epäonnistui.' -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Huom: SecurityScannerAppia ei löytynyt ($Skanneri). Toinen suojakerros jää pois, ja node tools/tarkista.mjs on punainen, kunnes se on asennettu tai tools/projekti.mjs kertoo syyn (eiSkanneria)." -ForegroundColor Yellow
}

git config core.hooksPath .githooks
Write-Host 'OK: core.hooksPath = .githooks'
Write-Host ''
Write-Host 'Hookit ovat käytössä: pre-commit, commit-msg, pre-merge-commit, pre-push (estää pushit), post-merge (varmuuskopio).'
if (-not (git config --get projekti.varmuuskopio)) {
    Write-Host 'Aseta vielä varmuuskopioiden kohde: git config projekti.varmuuskopio "D:\polku\kansioon"'
}
exit 0
