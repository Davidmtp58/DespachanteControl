param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ca = 'C:\Users\David Mangueira\supabase\prod-ca-2021.crt'
$applyFile = Join-Path $PSScriptRoot 'apply.psql'
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$source = $utf8.GetString([IO.File]::ReadAllBytes($applyFile))
$entries = [regex]::Matches($source, "\('(?<file>00[1-5]_[a-z_]+\.sql)','(?<hash>[0-9a-f]{64})'\)")
if ($entries.Count -ne 5) { throw 'Invalid migration manifest.' }
foreach ($entry in $entries) {
    $file = Join-Path $PSScriptRoot ('../migrations/' + $entry.Groups['file'].Value)
    $null = $utf8.GetString([IO.File]::ReadAllBytes($file))
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Groups['hash'].Value) {
        throw 'Migration checksum mismatch. Stop.'
    }
}
foreach ($file in @('../bootstrap.sql','check-encoding.psql','../verification/supabase-preflight.sql')) {
    $null = $utf8.GetString([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file)))
}
if (!(Test-Path -LiteralPath $ca -PathType Leaf)) { throw 'CA file not found.' }
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ca)
if ((Get-Date) -lt $cert.NotBefore -or (Get-Date) -gt $cert.NotAfter) { throw 'CA outside validity period.' }
Write-Host 'Target: despachante-control-hml / aws-0-us-east-2.pooler.supabase.com / postgres / postgres.zhonseyahndqlzoygolr'
if ($Apply) {
    if ((Read-Host 'Only after new authorization, type APPLY despachante-control-hml') -cne 'APPLY despachante-control-hml') {
        throw 'Cancelled before connection.'
    }
}
$connection = "host=aws-0-us-east-2.pooler.supabase.com hostaddr='' port=5432 dbname=postgres user=postgres.zhonseyahndqlzoygolr sslmode=verify-full sslrootcert='C:/Users/David Mangueira/supabase/prod-ca-2021.crt' connect_timeout=10 client_encoding=UTF8"
if (!$Apply) { $connection += " options='-c default_transaction_read_only=on -c statement_timeout=15000'" }
# Native -c arguments are ASCII only. UTF-8 SQL is read directly by psql -f/\ir.
$guard = "SELECT 1 / CASE WHEN current_database()='postgres' AND current_user='postgres' AND session_user='postgres' AND current_setting('server_version_num')::int=170011 AND current_setting('client_encoding')='UTF8' AND has_database_privilege(current_user,current_database(),'CREATE WITH GRANT OPTION') AND to_regnamespace('app') IS NULL AND to_regnamespace('dc_migrations') IS NULL AND NOT EXISTS (SELECT FROM pg_roles WHERE rolname IN ('dc_migrator','dc_api','dc_runtime')) THEN 1 ELSE 0 END AS destination_verified;"
$arguments = @('-X','-W',"--dbname=$connection",'--set=ON_ERROR_STOP=1','--pset=pager=off','-c',$guard,'-f',(Join-Path $PSScriptRoot 'check-encoding.psql'))
if ($Apply) { $arguments += @('-f',$applyFile) }
$previousEncoding = $env:PGCLIENTENCODING
try {
    $env:PGCLIENTENCODING = 'UTF8'
    & $psql @arguments
    if ($LASTEXITCODE -ne 0) { throw 'psql failed. Do not retry automatically; inspect remote state first.' }
} finally {
    $env:PGCLIENTENCODING = $previousEncoding
}
