# Sessões e proteção compartilhada de login — etapa 2 local

Implementação preparada e testada localmente. Não houve aplicação no Supabase.
Não há mudança de bcrypt, contratos de login/me/logout, cookie ou token CSRF.

## Seleção e compatibilidade

- Servidor tradicional (`server.ts`): `AUTH_STATE_STORE=memory` por padrão,
  preservando SQL Server e PostgreSQL locais. Para habilitar compartilhamento,
  definir explicitamente `AUTH_STATE_STORE=postgres` e `DB_PROVIDER=postgres`.
- Netlify Function: exige PostgreSQL; `AUTH_STATE_STORE` omitido significa
  `postgres`. Valor `memory` é rejeitado antes de atender requisições.
- Reutiliza `PostgresDatabase`, TLS e timeout existentes, sem outro pool.
  Continua exigindo Session pooler; não trocar para Transaction pooler sem
  adaptar/testar a configuração de sessão usada pelo executor.
- Não há fallback para memória em falhas. Ausência da migração ou de permissão
  produz 503 nas operações dependentes do estado de autenticação.
- Todas as instâncias precisam do MESMO SESSION_SECRET privado e estável.
  Rotacioná-lo invalida cookies, chaves de sessão e contadores anteriores.
  Não alteramos nenhum segredo nem arquivo de ambiente real.

## Dados e segurança

`dc_auth.sessions`: chave HMAC-SHA256 do SID, JSON da sessão e expiração absoluta.
O SID original não fica no banco. O JSON contém userId, versão da credencial,
token CSRF, metadados do cookie e expiresAt; não contém senha ou hash bcrypt.
`touch` não prolonga o prazo nem recria uma sessão após logout. A leitura usa
expiração no banco e o middleware mantém a validação de expiresAt e do usuário.
Login aguarda a gravação; logout aguarda a revogação atômica. Falhas retornam
`AUTH_STORAGE_UNAVAILABLE`/503, sem revelar SQL, parâmetros ou dados pessoais.
Uma requisição já autenticada antes do logout pode terminar; requisições
posteriores não autenticam com a sessão removida.

### Concorrência com logout

A linha tem `revoked boolean`. Logout faz UPSERT de uma tombstone com JSON vazio;
gravações fazem UPSERT condicionado a `NOT revoked`. A chave primária serializa
as operações no PostgreSQL, inclusive entre conexões/instâncias independentes.
Se a gravação vencer, o logout a revoga; se o logout vencer, a gravação retorna
zero linhas e falha com 503. Não existe janela de SELECT seguido de INSERT.
Repetir logout também não restaura dados. Login usa um SID novo e continua válido.

A tombstone dura 48 horas, acima do limite já existente de 24 horas das sessões.
O store valida esse limite e captura payload/prazo antes de qualquer await.
O INSERT também rejeita prazo expirado pelo relógio do banco. Atualizações não
prolongam `expires_at`. Isso permite eliminar tombstones expiradas sem aceitar
gravações antigas; os relógios do Node e PostgreSQL devem estar sincronizados.
Não reutilizar SIDs nem ampliar o TTL máximo sem revisar a retenção.

Salvar ou revogar remove até 100 expirados por operação, com SKIP LOCKED.
Não há tombstones permanentes: sob tráfego são coletadas; sem tráfego podem
permanecer fisicamente, mas não há crescimento por timer nem validade após prazo.
Não se promete limite fixo de linhas sob volume arbitrário ou bloqueios longos.

`dc_auth.login_limits`: HMAC do identificador de IP normalizado pelo
express-rate-limit, contador e fim da janela. Não armazena IP em texto claro.
O incremento com INSERT ON CONFLICT é atômico entre instâncias. Mantém a política
existente: todas as tentativas contam, inclusive logins bem-sucedidos; não há
reset no login nem novo bloqueio por e-mail. Expiração e janela usam o relógio
do PostgreSQL. Saturação do contador evita overflow sem liberar o cliente.
Falha do store bloqueia login antes da verificação da senha.

Expirados são removidos oportunisticamente em lotes de até 100 ao salvar sessões
ou incrementar limites, com índices e SKIP LOCKED. Não depende de timers em uma
Function. Sem tráfego, linhas expiradas podem permanecer, mas nunca autenticam.
Os dados de sessão são sensíveis e o schema não deve entrar na Data API.
Sem privilégios para PUBLIC, anon, authenticated ou service_role. dc_runtime
herda de dc_api somente USAGE e DML nessas duas tabelas; nenhum DDL ou acesso
novo aos cadastros. Não registrar cookies, tokens, chaves HMAC ou payloads.

## Migração 006 para revisão

Arquivo: `database/postgresql/migrations/006_auth_state.sql`.
Cria exclusivamente schema dc_auth, duas tabelas, dois índices de expiração,
constraints e permissões. Nenhuma FK nos cadastros, sequência ou dado de negócio.
Migrações 001–005 permanecem inalteradas. O harness descartável descobre 006;
o `deployment/apply.psql` antigo continua reservado à instalação 001–005.
NÃO o executar novamente em HML e NÃO executar runtime.sql.

Antes de aplicação futura, mediante autorização separada:

1. Backup privado e recuperação verificados; confirmar projeto, TLS verify-full,
   identidade administrativa, membership SET para dc_migrator e histórico 001–005.
2. Confirmar ausência de dc_auth e de registro 006. Se já existirem, interromper
   e investigar, sem DROP nem repetição automática.
3. Preparar execução administrativa com ON_ERROR_STOP, BEGIN, SET LOCAL ROLE
   dc_migrator, timeout local e advisory lock 74102901. Conferir checksum do
   arquivo revisado; incluir 006 e registrar versão/checksum em
   dc_migrations.history na MESMA transação. COMMIT apenas após conferir as
   tabelas vazias, índices, ownership e grants. Nunca aplicar pela API/startup.
4. Revisar o script incremental completo e seu checksum antes de autorizar
   execução; este guia não aplica nem automatiza a migração remota.
5. Verificar com dc_runtime as permissões e identidade; manter dc_auth fora da
   Data API. Só então habilitar AUTH_STATE_STORE=postgres na aplicação.
6. Testar login, instâncias distintas, expiração, logout, CSRF e falhas de banco
   em HML com autorização. O health/db atual só verifica conectividade;
   resposta 200 não comprova existência das tabelas de autenticação.

## Testes e limitações

`npm --prefix backend test` cobre falhas simuladas, seleção e privacidade.
`npm --prefix backend run test:postgres` usa clusters novos e descartáveis,
com PostgreSQL real e conta restrita, para sessões entre handlers/pools,
reinicialização simulada, CSRF, expiração, logout, concorrência, permissões e
falhas de leitura/gravação. Não usa URLs remotas nem bancos locais existentes.
`npm --prefix database/postgresql test` verifica migrações e regras SQL.

Persistência entre handlers locais não equivale a homologação Netlify: validar
headers de proxy/IP real, cookies Secure e origem HTTPS continua obrigatório.
Rate limit por IP não impede ataques distribuídos nem consumo de créditos;
esse mecanismo preserva a regra anterior sem criar funcionalidades adicionais.
Falha de logout retorna 503; a sessão no banco pode continuar válida até que
a revogação seja confirmada ou expire. A interface não deve declarar logout
bem-sucedido nesse caso. Restaurar backup com sessões pode reviver sessões
antigas ainda válidas: planejar invalidação do estado técnico na recuperação.
