# Run manually in a private terminal. Only health/auth endpoints; no business writes.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3001'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $base; 'X-Requested-With' = 'DespachanteControl' }

function Invoke-CheckedRequest {
    param([string]$Path, [string]$Method = 'GET', [int]$Expected = 200, [string]$Body)
    $response = $null
    $status = $null
    try {
        $arguments = @{
            Uri = "$base$Path"; Method = $Method; WebSession = $session
            Headers = $headers; UseBasicParsing = $true; ErrorAction = 'Stop'
        }
        if ($Body) { $arguments.Body = $Body; $arguments.ContentType = 'application/json; charset=utf-8' }
        $response = Invoke-WebRequest @arguments
        $status = [int]$response.StatusCode
    } catch {
        if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    }
    if ($null -eq $status -or $status -ne $Expected) {
        throw "Etapa $Method $Path falhou. Esperado HTTP $Expected. Teste interrompido."
    }
    Write-Host "$Method $Path : HTTP $status"
    return $response
}

try {
    $null = Invoke-CheckedRequest '/api/health'
    $null = Invoke-CheckedRequest '/api/health/db'
    $null = Invoke-CheckedRequest '/api/auth/me' -Expected 401
    $null = Invoke-CheckedRequest '/api/clientes' -Expected 401
    $email = Read-Host 'E-mail da conta ID 1'
    $securePassword = Read-Host 'Senha da aplicacao (nao e a senha do banco)' -AsSecureString
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $body = @{ email = $email; senha = $password } | ConvertTo-Json -Compress
        $loginResponse = Invoke-CheckedRequest '/api/auth/login' -Method POST -Body $body
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $password = $null; $body = $null
        if ($securePassword) { $securePassword.Dispose() }
    }
    $login = $loginResponse.Content | ConvertFrom-Json
    if ($login.usuario.id_usuario -ne 1 -or $login.csrfToken -notmatch '^[a-f0-9]{64}$') { throw 'Resposta de login inesperada.' }
    $meResponse = Invoke-CheckedRequest '/api/auth/me'
    $me = $meResponse.Content | ConvertFrom-Json
    if ($me.usuario.id_usuario -ne 1 -or $me.csrfToken -notmatch '^[a-f0-9]{64}$') { throw 'Sessao inesperada.' }
    # Missing CSRF must not destroy the authenticated session.
    $null = Invoke-CheckedRequest '/api/auth/logout' -Method POST -Expected 403
    $null = Invoke-CheckedRequest '/api/auth/me'
    $headers['X-CSRF-Token'] = $me.csrfToken
    $null = Invoke-CheckedRequest '/api/auth/logout' -Method POST -Expected 204
    $headers.Remove('X-CSRF-Token')
    $null = Invoke-CheckedRequest '/api/auth/me' -Expected 401
    Write-Host 'Validacao concluida para a conta ID 1. Nenhum dado de negocio foi alterado.'
} catch {
    # Never print raw exceptions, response bodies, headers or credentials.
    Write-Host 'Validacao interrompida. Consulte a ultima etapa HTTP aprovada; nao imprima respostas ou cookies.'
    throw 'Teste de autenticacao nao concluido.'
} finally {
    $password = $null; $body = $null; $email = $null
    $login = $null; $me = $null; $loginResponse = $null; $meResponse = $null
    $headers.Clear(); $session = $null
}
