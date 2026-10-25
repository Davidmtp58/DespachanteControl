# Autenticação local

A autenticação real está integrada ao frontend React. O backend permanece restrito a loopback. Não há cadastro público nem rota para administrar usuários. A tabela não possui papéis/perfis: todos os usuários ativos autenticados têm acesso às operações de negócio existentes. O usuário SQL `despachante_app` e o usuário humano da aplicação são identidades diferentes.

## Configuração

No terminal em `backend/`, gere um segredo novo:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
    $segredo = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    Set-Clipboard -Value $segredo
} finally {
    $rng.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
    $segredo = $null
}
```

O comando copia o segredo para a área de transferência sem imprimi-lo. Cole somente em `SESSION_SECRET` no `.env` local e depois limpe a área de transferência com `Set-Clipboard -Value ''` (e o histórico do Windows, se habilitado). Não execute durante gravação de tela nem envie o segredo no chat ou Git. O `.env.example` deixa esse campo vazio; o servidor recusa iniciar sem um segredo válido. Não sobrescreva seu `.env` existente nem gere outro segredo se já estiver configurado: trocá-lo invalida sessões existentes.

```dotenv
SESSION_SECRET=
SESSION_TTL_MINUTES=30
SESSION_COOKIE_SECURE=false
AUTH_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://localhost:3001
LOGIN_WINDOW_MINUTES=15
LOGIN_MAX_ATTEMPTS=10
```

Preencha o segredo antes de iniciar. As origens devem corresponder exatamente ao endereço usado no navegador; configure a porta do frontend quando diferente. HTTP local usa `SESSION_COOKIE_SECURE=false`; HTTPS exige `true`. `HOST` continua aceitando apenas `127.0.0.1`, `::1` ou `localhost`. Não configure acesso externo nesta etapa.

## Permissão SQL mínima (executar manualmente, não executado pela implementação)

No SSMS, com sua conta administrativa, conectado ao banco existente:

```sql
USE DespachanteControl;
GRANT SELECT ON OBJECT::dbo.Usuario TO [despachante_app];
```

Esse comando pressupõe que o usuário do banco mapeado ao login também se chama `despachante_app`, como no ambiente atual. A autenticação só faz SELECT parametrizado em Usuario (inclusive para conferir ativo e mudança de senha em cada acesso). Não precisa de INSERT, UPDATE, DELETE, ALTER ou db_owner nessa tabela. As permissões de negócio já existentes são separadas e não foram alteradas. Não conceda INSERT em Usuario ao login da API para preparar a primeira conta.

## Preparar a primeira conta sem senha em código ou histórico

Depois de instalar as dependências (`npm.cmd ci`), em um PowerShell interativo dentro de `backend/`:

```powershell
npm.cmd run user:prepare
```

O utilitário pede nome, e-mail, senha e confirmação. As senhas não são exibidas e não são argumentos de linha de comando. Use uma senha única com pelo menos 12 caracteres e no máximo 72 bytes UTF-8 (limite do bcrypt). O e-mail é normalizado para minúsculas. É gerado bcrypt com salt aleatório e custo 12; a senha clara não é impressa nem gravada em arquivo. O processo precisa dela brevemente em memória para calcular o hash.

O utilitário **não importa a conexão SQL, não lê `.env` e não executa comandos no banco**. Ele apenas imprime um bloco SQL contendo nome, e-mail e hash. Revise esse bloco e, somente quando decidir ativar a conta, execute-o no SSMS com sua conta administrativa. Não versione o bloco nem salve dados da conta no repositório.

O SQL usa transação e verifica a tabela com bloqueio antes da inserção. Se já existir qualquer usuário, ele recusa a criação inicial e não modifica registros. Nesse caso, inspecione a situação com sua conta administrativa antes de definir uma recuperação; não exclua usuários nem reutilize este procedimento para substituí-los. A API não migra hashes antigos nem redefine senhas automaticamente. Nenhuma conta foi criada nesta implementação.

## Contratos HTTP

| Rota | Requisição | Resposta |
| --- | --- | --- |
| `POST /api/auth/login` | JSON `{ "email": "...", "senha": "..." }`, cabeçalho `X-Requested-With: DespachanteControl` | 200 com `{ usuario, csrfToken }` e cookie de sessão |
| `GET /api/auth/me` | Cookie válido | 200 com `{ usuario, csrfToken }` |
| `POST /api/auth/logout` | Cookie válido e `X-CSRF-Token` | 204, sessão destruída no servidor e cookie apagado |

`usuario` contém somente `id_usuario`, `nome`, `email`, `ativo`, `data_cadastro`. Nunca inclui `senha_hash`, senha ou identificador de sessão no JSON.

E-mail inexistente, senha incorreta e usuário inativo retornam o mesmo 401: `INVALID_CREDENTIALS`. Sessão inválida/expirada retorna 401 `UNAUTHENTICATED`. CSRF/origem inválidos retornam 403. Excesso de tentativas retorna 429 com `Retry-After`. Falhas inesperadas retornam 500 genérico. Requisições de login malformadas retornam 400. O limite padrão é de 10 tentativas por IP por 15 minutos, contando também logins bem-sucedidos; o servidor não confia em X-Forwarded-For.

Todos os endpoints de negócio (Clientes, Veículos, Serviços, Tipos, Despesas e Financeiro) exigem sessão. POST/PUT/DELETE também exigem `X-CSRF-Token`. Somente os health checks existentes permanecem públicos. Não há criação de contas via HTTP. Sem configuração de autenticação, a aplicação não libera rotas de negócio.

## Sessões e integração com React

O cookie `dc.sid` é assinado, `HttpOnly`, `SameSite=Strict`, sem Domain e com expiração. Só contém o identificador opaco da sessão; os dados ficam no servidor. O login regenera a sessão para evitar fixação. A validade absoluta padrão é de 30 minutos, sem prolongamento por atividade. Logout remove a sessão: reutilizar o cookie anterior não funciona. Cada acesso consulta Usuario; desativação, exclusão ou mudança de hash invalidam a sessão na próxima requisição.

Use `fetch` com `credentials: 'include'` no React, inclusive no login. Não armazene cookie, senha ou token de autenticação em localStorage/sessionStorage. Guarde apenas o `csrfToken` em memória; após recarregar a página, obtenha-o novamente em `/api/auth/me`. Envie-o em `X-CSRF-Token` nas gravações e no logout. CORS aceita somente as origens exatas configuradas, com credenciais; o login exige cabeçalho customizado e JSON para impedir submissão por formulário de outra origem.

Use o mesmo hostname para frontend e API (ambos `127.0.0.1` ou ambos `localhost`), mesmo com portas diferentes, para respeitar SameSite. A senha é enviada apenas no login; a aplicação não deve persistir a senha. O frontend utiliza estes endpoints, guarda CSRF somente em memória e recupera a sessão ao recarregar.

As sessões e o limite de login ficam em memória neste processo. O armazenamento de sessões tem limpeza periódica e limite de 1000 sessões; reiniciar o backend encerra sessões e reinicia os limites. Essa estratégia é para o ambiente local atual. Antes de disponibilizar o sistema ou usar múltiplos processos, será necessário HTTPS e armazenamento compartilhado de sessões/limites. Referências: [Express session](https://expressjs.com/en/resources/middleware/session/) e [OWASP — armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Validação manual após a ativação autorizada

Inicie com `npm.cmd run dev`. O bloco abaixo faz login, consultas de leitura e logout, imprimindo somente status HTTP; digite a senha no prompt protegido, nunca no comando:

```powershell
$baseUrl = 'http://127.0.0.1:3001'
$sessao = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$ponteiroSenha = [IntPtr]::Zero
$senhaProtegida = $null
try {
    $email = Read-Host 'E-mail'
    $senhaProtegida = Read-Host 'Senha' -AsSecureString
    try {
        $ponteiroSenha = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaProtegida)
        $senhaTexto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroSenha)
        $corpoLogin = @{ email = $email; senha = $senhaTexto } | ConvertTo-Json
        $login = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST `
            -ContentType 'application/json; charset=utf-8' `
            -Headers @{ 'X-Requested-With' = 'DespachanteControl' } `
            -Body ([Text.Encoding]::UTF8.GetBytes($corpoLogin)) `
            -WebSession $sessao -UseBasicParsing -ErrorAction Stop
    } finally {
        if ($ponteiroSenha -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroSenha)
        }
        $senhaTexto = $null
        $corpoLogin = $null
        if ($null -ne $senhaProtegida) { $senhaProtegida.Dispose() }
    }
    if ([int]$login.StatusCode -ne 200) { throw 'Resposta inesperada.' }
    Write-Host "Login: HTTP $([int]$login.StatusCode)"
    $login = $null
    $me = Invoke-WebRequest -Uri "$baseUrl/api/auth/me" -WebSession $sessao `
        -UseBasicParsing -ErrorAction Stop
    if ([int]$me.StatusCode -ne 200) { throw 'Resposta inesperada.' }
    $csrf = ($me.Content | ConvertFrom-Json).csrfToken
    if ($csrf -notmatch '^[a-f0-9]{64}$') { throw 'Resposta inesperada.' }
    Write-Host "Sessão: HTTP $([int]$me.StatusCode)"
    $me = $null
    $consulta = Invoke-WebRequest -Uri "$baseUrl/api/clientes" -WebSession $sessao `
        -UseBasicParsing -ErrorAction Stop
    if ([int]$consulta.StatusCode -ne 200) { throw 'Resposta inesperada.' }
    Write-Host "Consulta: HTTP $([int]$consulta.StatusCode)"
    $consulta = $null
    $logout = Invoke-WebRequest -Uri "$baseUrl/api/auth/logout" -Method POST `
        -WebSession $sessao -Headers @{ 'X-CSRF-Token' = $csrf } `
        -UseBasicParsing -ErrorAction Stop
    if ([int]$logout.StatusCode -ne 204) { throw 'Resposta inesperada.' }
    Write-Host "Logout: HTTP $([int]$logout.StatusCode)"
} catch {
    # Não imprimir a exceção original, headers ou corpo da resposta.
    throw 'Teste interrompido. Confira disponibilidade, credenciais e limites de login; nenhum detalhe sensível foi impresso.'
} finally {
    $csrf = $null
    $login = $null
    $me = $null
    $consulta = $null
    $logout = $null
    $sessao = $null
    $email = $null
}
```

O exemplo acima encerra a sessão e limpa as variáveis. Para consultar os endpoints de negócio do README, insira as consultas dentro do bloco try, antes do logout, reutilizando `$sessao`. Capture as respostas em variáveis e mostre somente StatusCode; não imprima corpos ou cabeçalhos completos. Para futuras escritas autorizadas, acrescente também `-Headers @{ 'X-CSRF-Token' = $csrf }`; não execute escritas reais apenas para validar a autenticação.

## Testes

`npm.cmd test`, `npm.cmd run typecheck` e `npm.cmd run build` não requerem SQL Server nem `.env`. Os testes usam hashes e contas fictícios, login HTTP real contra repositório simulado e cookies/CSRF nas suítes anteriores. Cobrem senha inválida, conta inativa, sessão expirada/revogada, rotação, logout, CSRF/CORS, limitação de tentativas e queries parametrizadas. O teste de preparação de usuário apenas verifica o texto gerado e o hash; não executa SQL.
