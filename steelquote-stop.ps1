# SteelQuote - zatrzymanie lokalnej bazy (Next dev zatrzymaj Ctrl+C w jego oknie)
$bin  = "C:\Users\mmazur\pgportable\pgsql\bin"
$data = "C:\Users\mmazur\pgdata"
& "$bin\pg_ctl.exe" -D $data stop
Write-Host "Postgres zatrzymany."
Write-Host "Jesli Next dev nadal chodzi - zatrzymaj go Ctrl+C w jego terminalu."
