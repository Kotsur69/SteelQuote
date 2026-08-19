# SteelQuote - lokalne srodowisko testowe (przenosny Postgres + migracje + seed + Next.js dev)
# Uruchom: prawy klik > "Uruchom z PowerShell", albo w terminalu: powershell -File steelquote-start.ps1
#
# Jedyne narzedzie potrzebne, zeby odpalic appke lokalnie - jedno uruchomienie, zero recznych krokow:
#   1. startuje przenosny Postgres (jesli jeszcze nie dziala)
#   2. tworzy baze 'steelquote', jesli jeszcze nie istnieje
#   3. wgrywa WSZYSTKIE migracje z migrations/ (bezpieczne do wielokrotnego uruchamiania - IF NOT EXISTS)
#   4. npm install, jesli node_modules nie istnieje (--legacy-peer-deps, patrz STAN_PROJEKTU)
#   5. seeduje 4 konta testowe - WYLACZNIE do lokalnej bazy (patrz zabezpieczenie nizej)
#   6. startuje next dev -> http://localhost:3000 i sam otwiera przegladarke po starcie
#
# NIE dotyka .env (sekrety produkcyjne AbacusAI) - lokalny DATABASE_URL bierze z .env.local.

$ErrorActionPreference = "Stop"

$bin      = "C:\Users\mmazur\pgportable\pgsql\bin"
$data     = "C:\Users\mmazur\pgdata"
$app      = "C:\Users\mmazur\source\repos\AMSteel_Quote\finance_calculator_deployed\nextjs_space"
$dbName   = "steelquote"
$localUrl = "postgresql://postgres@localhost:5432/$dbName"

# --- 1. Postgres: wystartuj jesli nie dziala ---
# pg_isready sprawdza realne polaczenie na porcie, wiec nie daje sie zmylic przez nieaktualny
# plik postmaster.pid po niecczystym zamknieciu (przez to pg_ctl status potrafil falszywie
# krzyczec "brak uruchomionego serwera" mimo ze Postgres realnie chodzil).
& "$bin\pg_isready.exe" -p 5432 *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Postgres juz dziala."
} else {
    Write-Host "Startuje Postgres na porcie 5432..."
    & "$bin\pg_ctl.exe" -D $data -o "-p 5432" -l "$data\server.log" start
}

# czekaj az przyjmuje polaczenia (do ~15s)
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    & "$bin\pg_isready.exe" -p 5432 *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    throw "Postgres nie odpowiada po 15s. Sprawdz $data\server.log."
}
Write-Host "Postgres gotowy."

# --- 2. Baza 'steelquote': utworz jesli brak ---
$dbList = & "$bin\psql.exe" -U postgres -h localhost -p 5432 -lqt
if (-not ($dbList -match "\b$dbName\b")) {
    Write-Host "Tworze baze '$dbName'..."
    & "$bin\createdb.exe" -U postgres -h localhost -p 5432 $dbName
} else {
    Write-Host "Baza '$dbName' juz istnieje."
}

# --- 3. Wszystkie migracje z migrations/ (idempotentne, IF NOT EXISTS) ---
Write-Host "Wgrywam migracje..."
$migrationsDir = Join-Path $app "migrations"
Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    & "$bin\psql.exe" -U postgres -h localhost -p 5432 -d $dbName -v ON_ERROR_STOP=1 -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Migracja $($_.Name) nie powiodla sie." }
}

# --- 4. npm install jesli brak node_modules ---
Set-Location $app
if (-not (Test-Path (Join-Path $app "node_modules"))) {
    Write-Host "node_modules brak - instaluje zaleznosci (--legacy-peer-deps)..."
    npm install --legacy-peer-deps
} else {
    Write-Host "node_modules jest - pomijam npm install."
}

# --- 5. Seed kont testowych - WYLACZNIE lokalnie ---
# UWAGA: scripts/seed.ts laduje .env przez zwykly dotenv.config(), ktory NIE nadpisuje
# juz ustawionych zmiennych srodowiskowych. Ustawiajac DATABASE_URL na localhost TUTAJ,
# zanim odpalimy seed, wymuszamy zapis do lokalnej bazy, a nie do produkcyjnej z .env.
$env:DATABASE_URL = $localUrl
if ($env:DATABASE_URL -notmatch "localhost") {
    throw "Bezpiecznik: DATABASE_URL nie wskazuje na localhost - przerywam seed, zeby nie ruszyc produkcji."
}
Write-Host "Seeduje konta testowe (lokalnie)..."
npx tsx --require dotenv/config scripts/safe-seed.ts
Remove-Item Env:\DATABASE_URL

Write-Host ""
Write-Host "Konta testowe (haslo w nawiasie):"
Write-Host "  admin  -> example@gmail.com (1234)"
Write-Host "  senior -> starszy@email.com (1234)"
Write-Host "  junior -> mlodszy@email.com (1234)"
Write-Host "  junior -> john@doe.com (johndoe123)"
Write-Host ""

# --- 6. Next.js dev ---
# odpalamy otwarcie przegladarki w tle z opoznieniem, zeby nie trzeba bylo tego robic recznie
Start-Job -ScriptBlock { Start-Sleep -Seconds 4; Start-Process "http://localhost:3000" } | Out-Null
Write-Host "Startuje Next.js dev -> http://localhost:3000  (Ctrl+C aby zatrzymac)"
npm run dev
