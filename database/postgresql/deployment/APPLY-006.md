# Migração incremental 006 — revisão, não executar ainda

## Concorrência corrigida localmente

O teste `backend/tests/diagnostics/session-logout-race.test.ts` agora passa.
A migração 006 adiciona `revoked` na própria linha: logout apaga o payload e
marca revogação; o UPSERT de gravação nunca atualiza uma linha revogada.
Foram testadas ambas as ordens em conexões PostgreSQL descartáveis independentes.
Retenção de 48h e coleta oportunística estão documentadas em backend/AUTH-STATE.md.

**A aplicação remota continua dependente de autorização separada.** O checksum
da 006 foi recalculado e atualizado nos dois scripts; 001–005 não mudaram.

## Arquivos completos para revisão

- `apply-006.psql`: transação incremental, somente 006, validações e histórico.
- `apply-006.ps1`: entrada PowerShell que verifica os arquivos e fixa a conexão.
- `../migrations/006_auth_state.sql`: versão revisada com revogação persistente.

Não executar `apply.psql`, `bootstrap.sql` ou `runtime.sql` para esta etapa.
Não usar o script incremental isoladamente: o lançador PowerShell é parte do
procedimento de segurança e verifica SHA256 dos seis arquivos locais.

## Procedimento futuro, sujeito a nova autorização

1. Revisar a correção acima e os testes de concorrência,
   PostgreSQL descartável e fluxo HTTP. Os testes estáticos
   não substituem execução transacional em PostgreSQL nem homologação remota.
2. Confirmar no painel Connect o projeto `despachante-control-hml`, referência
   `zhonseyahndqlzoygolr`, Session pooler `aws-0-us-east-2.pooler.supabase.com`,
   porta 5432, banco `postgres`, login `postgres.zhonseyahndqlzoygolr`.
   Confirmar Data API desativada e backup recuperável recente, sem executar
   restauração neste procedimento. Pausar a aplicação durante a janela.
3. Conferir o certificado CA local e usar terminal PowerShell novo sem variáveis
   `PG*`. O lançador rejeita variáveis herdadas, usa `-X`, `-W`, UTF8 e conninfo
   explícito com `sslmode=verify-full`. A senha administrativa é digitada
   exclusivamente no prompt privado do psql. Não usar credenciais dc_runtime.
4. Revisar os arquivos, não os modificar durante a execução e executar uma
   única vez o comando abaixo, a partir da raiz do repositório, **apenas depois
   da autorização separada**:

```powershell
& '.\database\postgresql\deployment\apply-006.ps1' -ConfirmTarget 'despachante-control-hml/006'
```

5. Conferir saída e código de retorno. Em erro ou desconexão, não repetir.
   Fazer diagnóstico somente de leitura do histórico e schema antes de decidir
   qualquer ação. Perda de conexão durante COMMIT pode deixar resultado incerto.

## Garantias e limites

- A identidade do projeto depende do endpoint real fixado no libpq, do usuário
  com referência do projeto, do painel Connect e da validação TLS. `postgres`
  como nome de banco ou usuário, isoladamente, não identifica o projeto.
- `pg_stat_ssl` observa a conexão entre Supavisor e PostgreSQL; um resultado
  falso não identifica o TLS entre psql e Supavisor. Por isso não é usado como
  bloqueio de TLS do cliente. Não foi alterada a configuração interna do pooler.
- A verificação obrigatória ocorre no libpq, antes de executar qualquer SQL:
  `sslmode=verify-full`, CA fixado e hostname real fixado. Falha de TLS, cadeia
  ou hostname impede a conexão. `gssencmode=disable` impede a preferência de
  criptografia GSS sobre TLS; não desabilita TLS nem validação de certificado.
- `\conninfo` mostra os detalhes da mesma conexão que executará a transação,
  antes do primeiro SELECT, sem senha. É evidência do transporte negociado,
  não prova isolada de validação do CA/hostname. Não há segunda conexão de
  preflight, parsing de mensagens traduzidas nem reconexão dentro do script.
  A garantia depende de executar pelo lançador revisado; o `.psql` sozinho não
  impõe parâmetros do libpq. Não usar `-f` avulso com uma conexão mais fraca.
- Este procedimento valida somente o trecho cliente → Supavisor, não promete
  TLS ponta a ponta até PostgreSQL. A proteção do trecho interno depende da
  configuração gerenciada pelo Supabase; se TLS verificável nesse trecho for
  requisito, interromper e avaliar conexão direta antes da implantação.
- O script rejeita histórico diferente dos cinco pares versão/checksum
  conhecidos e schema `dc_auth` preexistente; não tenta reparar instalação
  parcial. O advisory lock e o bloqueio do histórico serializam execuções.
- DDL e histórico ficam na mesma transação sob `SET LOCAL ROLE dc_migrator`.
  `ON_ERROR_STOP` interrompe qualquer erro; encerramento da conexão desfaz
  transação não confirmada. Não há repetição automática.
- Antes de COMMIT: ownership, duas tabelas vazias, quatro índices válidos,
  constraints, histórico, DML mínimo e ausência de acesso PUBLIC/Data API são
  conferidos. Privilégios inesperados abortam, sem correção automática.
- Não há DML em tabelas de negócio nem reaplicação de 001–005. Sessões e limites
  de login são dados técnicos privados; backups deles também são sensíveis.
- A correção foi validada com executor simulado e PostgreSQL descartável.
  Não houve conexão ao Supabase ou aos bancos locais permanentes.

## Reproduzir verificações locais

```powershell
node --test database/postgresql/tests/apply-006-static.test.mjs
Push-Location backend
try {
  node --import tsx --test tests/diagnostics/session-logout-race.test.ts
  npm.cmd run typecheck
} finally { Pop-Location }
```
