# AI assistant demo database - one-shot local setup (docs/ai-assistant-plan.md, phase 0).
#
# Creates a SEPARATE local database `steelquote_ai` next to the normal dev DB `steelquote`
# (which stays untouched), runs every migration, seeds the test accounts (scripts/seed.ts) and
# the deterministic demo offers (scripts/assistant-demo/seed.ts).
#
# Usage (from nextjs_space):  powershell -File scripts/assistant-demo/setup.ps1 [-Reset]
#   -Reset  wipes offers + approval steps in steelquote_ai and seeds them again.
#
# Expects the portable Postgres used by steelquote-start.ps1 to be running on :5432.

param([switch]$Reset)

$ErrorActionPreference = "Stop"

$bin    = "C:\Users\mmazur\pgportable\pgsql\bin"
$app    = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$dbName = "steelquote_ai"
$url    = "postgresql://postgres@localhost:5432/$dbName"

& "$bin\pg_isready.exe" -p 5432 *> $null
if ($LASTEXITCODE -ne 0) { throw "Postgres is not running on :5432 - start it first (steelquote-start.ps1)." }

$dbList = & "$bin\psql.exe" -U postgres -h localhost -p 5432 -lqt
if (-not ($dbList -match "\b$dbName\b")) {
    Write-Host "Creating database '$dbName'..."
    & "$bin\createdb.exe" -U postgres -h localhost -p 5432 $dbName
}

Write-Host "Running migrations..."
# Windows PowerShell turns any native stderr line (psql NOTICEs) into an error under "Stop";
# rely on psql's exit code (ON_ERROR_STOP) instead and keep notices quiet.
$env:PGOPTIONS = "-c client_min_messages=warning"
$ErrorActionPreference = "Continue"
Get-ChildItem -Path (Join-Path $app "migrations") -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    & "$bin\psql.exe" -U postgres -h localhost -p 5432 -d $dbName -q -v ON_ERROR_STOP=1 -f $_.FullName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Migration $($_.Name) failed" }
}
$ErrorActionPreference = "Stop"
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue

Push-Location $app
try {
    $env:DATABASE_URL = $url
    Write-Host "Seeding accounts..."
    npx tsx scripts/seed.ts
    if ($LASTEXITCODE -ne 0) { throw "Account seed failed" }
    Write-Host "Seeding demo offers..."
    if ($Reset) { npx tsx scripts/assistant-demo/seed.ts --reset } else { npx tsx scripts/assistant-demo/seed.ts }
    if ($LASTEXITCODE -ne 0) { throw "Demo seed failed" }
    Write-Host "Verifying..."
    # verify.ts loads access contexts, whose module graph requires JWT_SECRET; it signs nothing.
    $env:JWT_SECRET = "verify-only-not-used"
    npx tsx scripts/assistant-demo/verify.ts
    if ($LASTEXITCODE -ne 0) { throw "Verification failed" }
    Write-Host "Building golden set..."
    npx tsx scripts/assistant-demo/build-golden.ts
    if ($LASTEXITCODE -ne 0) { throw "Golden build failed" }
} finally {
    Pop-Location
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
}

Write-Host "Done. Point the worktree's .env.local at: $url"
