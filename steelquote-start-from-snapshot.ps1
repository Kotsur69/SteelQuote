# SteelQuote - odtworzenie lokalnej bazy z zewnetrznego snapshotu (pg_dump .sql) + Next.js dev
# Uruchom: powershell -File steelquote-start-from-snapshot.ps1 [-SnapshotPath "C:\sciezka\do\pliku.sql"]
#
# Dla testow na REALNYCH danych (np. z produkcji), zamiast test-owego seeda z steelquote-start.ps1:
#   1. startuje przenosny Postgres (jesli jeszcze nie dziala)
#   2. DROPUJE i tworzy od nowa baze 'steelquote' - kazde uruchomienie to czysty stan ze snapshotu
#   3. tworzy rola-wlasciciela z dumpa (Abacus/Supabase eksportuje jako 'role_...', ktora
#      lokalnie nie istnieje - bez niej ALTER TABLE ... OWNER TO w dumpie by sie wywalilo)
#   4. wgrywa caly plik .sql (schema + dane) - NIE odpala migrations/ ani seed.ts, bo dump
#      juz zawiera pelny stan
#   5. npm install, jesli node_modules nie istnieje
#   6. startuje next dev -> http://localhost:3000
#
# UWAGA: to nadpisuje WSZYSTKO co jest teraz w lokalnej bazie 'steelquote'. Domyslny snapshot
# to najnowszy plik .sql w C:\Users\mmazur\pg-snapshots (trzymany poza repo i poza Pobranymi,
# zeby przypadkowe sprzatanie Pobranych go nie skasowalo).

param(
    [string]$SnapshotPath
)

$ErrorActionPreference = "Stop"

$bin           = "C:\Users\mmazur\pgportable\pgsql\bin"
$data          = "C:\Users\mmazur\pgdata"
$app           = "C:\Users\mmazur\source\repos\AMSteel_Quote\finance_calculator_deployed\nextjs_space"
$dbName        = "steelquote"
$snapshotsDir  = "C:\Users\mmazur\pg-snapshots"

if (-not $SnapshotPath) {
    $latest = Get-ChildItem -Path $snapshotsDir -Filter "*.sql" -ErrorAction Stop |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        throw "Brak pliku .sql w $snapshotsDir. Podaj -SnapshotPath albo wrzuc tam dump."
    }
    $SnapshotPath = $latest.FullName
}
if (-not (Test-Path $SnapshotPath)) {
    throw "Nie znaleziono snapshotu: $SnapshotPath"
}
Write-Host "Snapshot: $SnapshotPath"

# --- 1. Postgres: wystartuj jesli nie dziala ---
& "$bin\pg_isready.exe" -p 5432 *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Postgres juz dziala."
} else {
    Write-Host "Startuje Postgres na porcie 5432..."
    & "$bin\pg_ctl.exe" -D $data -o "-p 5432" -l "$data\server.log" start
}

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

# --- 2. Baza 'steelquote': drop + create od nowa ---
Write-Host "Zamykam polaczenia i dropuje baze '$dbName' (jesli istnieje)..."
& "$bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$dbName' AND pid <> pg_backend_pid();" | Out-Null
& "$bin\dropdb.exe" -U postgres -h localhost -p 5432 --if-exists $dbName
Write-Host "Tworze baze '$dbName'..."
& "$bin\createdb.exe" -U postgres -h localhost -p 5432 $dbName

# --- 3. Rola-wlasciciel z dumpa (Abacus/Supabase eksportuje ALTER ... OWNER TO role_xxx) ---
$roles = Select-String -Path $SnapshotPath -Pattern "OWNER TO (role_\w+)" | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -Unique
foreach ($role in $roles) {
    Write-Host "  -> tworze rola $role (NOLOGIN, tylko zeby ALTER OWNER z dumpa nie failowal)"
    & "$bin\psql.exe" -U postgres -h localhost -p 5432 -d $dbName -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$role') THEN CREATE ROLE $role NOLOGIN; END IF; END `$`$;" | Out-Null
}

# --- 4. Restore calego dumpa (schema + dane) ---
# ON_ERROR_STOP=0: nowsze psql (pg_dump 17+) dodaje \restrict / \unrestrict, ktorych starszy
# klient psql nie zna - to niegrozny blad parsera na koniec pliku, ale nie moze przerywac
# calego restore'a.
Write-Host "Wgrywam snapshot..."
& "$bin\psql.exe" -U postgres -h localhost -p 5432 -d $dbName -v ON_ERROR_STOP=0 -f $SnapshotPath | Out-Null
Write-Host "Snapshot wgrany."

# --- 5. npm install jesli brak node_modules ---
Set-Location $app
if (-not (Test-Path (Join-Path $app "node_modules"))) {
    Write-Host "node_modules brak - instaluje zaleznosci (--legacy-peer-deps)..."
    npm install --legacy-peer-deps
} else {
    Write-Host "node_modules jest - pomijam npm install."
}

# --- 6. Next.js dev ---
Start-Job -ScriptBlock { Start-Sleep -Seconds 4; Start-Process "http://localhost:3000" } | Out-Null
Write-Host "Startuje Next.js dev -> http://localhost:3000  (Ctrl+C aby zatrzymac)"
npm run dev
