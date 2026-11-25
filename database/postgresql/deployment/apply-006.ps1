# Future execution only, after separate authorization and review of revised 006.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('despachante-control-hml/006')][string]$ConfirmTarget)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -PathType Leaf)) {
    throw 'PostgreSQL 17 psql.exe not found at the required absolute path.'
}
if (@(Get-ChildItem Env: | Where-Object Name -Like 'PG*').Count -ne 0) {
    throw 'Review and remove inherited PG settings in a separate terminal before execution.'
}
$ca = 'C:/Users/David Mangueira/supabase/prod-ca-2021.crt'
if (-not (Test-Path -LiteralPath $ca -PathType Leaf)) { throw 'CA file missing.' }
$expected = @{
    '001_schema.sql'='a20e471b73ad89f8a57acd6d66ab560b8f89df01091e745289c9e4ebc8865242'
    '002_financeiro.sql'='d6d98b15b61e5e97f4845e032700ea212eb56806586e255b88dfee20d0388798'
    '003_tipos_servico.sql'='3c7b24938edf58d6ecf9ec35253ca7d50e7b4b483528c55ff5095cc71637a760'
    '004_permissoes.sql'='d5ffc65c7b2a0039e164d36d9d9c1896bb70b35be5f57cf28cd7ba3b0f1cc637'
    '005_unicode_nfc.sql'='9b8d22a45719869825cc0689ff8a3b521732668d77397f0c1b8ad0ef3daaf5d7'
    '006_auth_state.sql'='cdbb65fe66120cf7c7408475d700a9620923ec6d5d98d73ea0c48e9b5e8ef70c'
}
foreach ($name in $expected.Keys) {
    $path = Join-Path $PSScriptRoot "../migrations/$name"
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $expected[$name]) {
        throw "Checksum mismatch: $name. Stop and review; do not update automatically."
    }
}
$env:PGCLIENTENCODING = 'UTF8'
try {
    # No password in arguments, environment or files: psql prompts privately (-W).
    # libpq must validate TLS/CA/hostname before any SQL. Disable GSS encryption
    # preference so it cannot supersede sslmode. No plaintext or weaker TLS fallback.
    & 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W --dbname="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.zhonseyahndqlzoygolr sslmode=verify-full sslrootcert='$ca' gssencmode=disable connect_timeout=15" -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot 'apply-006.psql')
    if ($LASTEXITCODE -ne 0) { throw 'Application failed. Do not retry; inspect history read-only first.' }
} finally {
    Remove-Item Env:PGCLIENTENCODING
}
