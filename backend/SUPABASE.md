# Supabase — preparação da Etapa 4.1

## Falha da primeira conta: diagnóstico administrativo sem nova tentativa

O diagnóstico runtime confirmou zero usuários após a falha relatada. Não é
possível inferir a causa da antiga mensagem genérica: os prompts de nome/senha
da conta eram exibidos antes de client.connect. Respondê-los não comprovava
autenticação administrativa. dc_runtime funcionar não valida a senha postgres.

create-postgres-first-user.ts agora aceita exclusivamente o argumento opcional
`--diagnose-read-only`. Nesse modo exige o endpoint HML e usuário administrativo
conhecidos, confirma o destino e pede somente a senha administrativa oculta.
Não pede nome, e-mail ou senha de conta, não calcula hash e não chama a criação.
Não carrega dotenv/.env ou credenciais do runtime. Usa TLS verificado e startup
read-only, BEGIN READ ONLY, SELECTs e SET LOCAL ROLE/timeout, encerrando com ROLLBACK.
Não executa lock exclusivo, nextval, INSERT, DDL, concessões ou alterações permanentes.

Após configurar ADMIN_PG_HOST/PORT/DATABASE/USER/SSL_CA_FILE com os valores HML
do roteiro abaixo, executar no backend SOMENTE:

```powershell
& .\node_modules\.bin\tsx.cmd src/scripts/create-postgres-first-user.ts --diagnose-read-only
```

A saída contém apenas identidade e metadados permitidos: capacidade SET ROLE,
existência da tabela, timeout, role efetiva, USAGE do schema/sequence, SELECT,
INSERT/UPDATE da tabela, ownership e contagem de usuários. Privilégio INSERT é
consultado por has_table_privilege, nunca exercido. Isso não valida a senha da
nova conta, os seus limites, o lock sob concorrência ou a execução dos triggers
durante um INSERT; estes permanecem cobertos apenas pelos testes locais anteriores.

Erros agora mostram etapa e código técnico de allowlist, sem mensagem/detail/query/
parâmetros/credenciais do driver. Etapas: config, confirmation, input, connect,
identity, validation, hash, begin, role, timeout, lock, existing_user, insert, commit,
permissions. Código desconhecido vira UNCLASSIFIED. Exemplos: connect/28P01 indica
falha de autenticação; role/42501 indica permissão para SET ROLE; timeout/UNCLASSIFIED
pode indicar SHOW inesperado; lock/55P03 indica indisponibilidade do lock;
insert/23505 indica unicidade. Não inventar a causa sem observar a etapa/código.
Nenhum retry automático. Erro em commit exige conferir persistência antes de repetir.

A sessão administrativa precisa poder assumir dc_migrator (SET TRUE); CREATEROLE
não é equivalente a SET ROLE. O grant pode ter origem em outro administrador do
Supabase: não revogar associações gerenciadas nem ampliar privilégios por tentativa.
O nome com sufixo do projeto é usado na entrada do pooler; session_user esperado
no PostgreSQL é postgres. Sucesso em psql não substitui o teste pelo mesmo driver.

## Primeira conta: timeout administrativo verificado

create-postgres-first-user.ts continua usando o serviço postgres-first-user.ts.
Na mesma transação, após SET LOCAL ROLE dc_migrator e antes do lock/INSERT,
o serviço executa SET LOCAL statement_timeout = '15s' e SHOW statement_timeout.
Só prossegue se o valor retornado for 15s. Falha, ausência ou valor diferente
provocam rollback e erro sanitizado, sem INSERT. lock_timeout=5s, lock exclusivo,
verificação de tabela vazia, bcrypt12 e parâmetros continuam preservados.
O timeout é local à transação: COMMIT/ROLLBACK o desfazem, sem ALTER ROLE/DATABASE.
Testes dessa alteração usam client simulado; nenhuma conta ou banco real é acessado.
O comando administrativo existente permanece válido, mas sua execução remota
exige autorização separada e não faz parte desta preparação.

## Validação do statement_timeout no diagnóstico Node

O comando diagnose:supabase agora consulta pg_settings (name, setting, unit,
source, reset_val) antes e depois de SET LOCAL statement_timeout = '15s', sempre
no mesmo Client e dentro de BEGIN READ ONLY. Confirma SHOW statement_timeout=15s
e setting=15000/unit=ms; se diferente, interrompe antes das leituras de negócio.
Depois de ROLLBACK, consulta novamente pg_settings e exige retorno ao setting,
unit e reset_val originais. Só então imprime sucesso. Em falha, encerra a conexão;
nenhum ALTER ROLE/DATABASE, mudança de .env ou retry é realizado.

`connection.statement_timeout` representa o valor ANTES do SET LOCAL. O campo
`timeout` mostra requested_startup_ms, before, show_after_set_local, local,
after_rollback e restored. Exemplo esperado: 120000ms ->15000ms ->120000ms.
O valor de source ajuda a identificar a origem efetiva, mas não prova sozinho
onde um parâmetro do startup foi descartado ou sobrescrito pelo pooler.

### Pool do backend: proposta, ainda não implementada

Hoje PostgresDatabase.query usa pool.query diretamente. Para não depender do
startup, a opção simples para o Session pooler é obter um client com pool.connect,
aguardar `SELECT set_config('statement_timeout', $1, false)` com o valor validado
em milissegundos, verificar `SELECT setting, unit FROM pg_settings WHERE
name='statement_timeout'` e só então executar a consulta de negócio nesse client.
Fazer isso em cada aquisição cobre conexões novas, reutilizadas e substituídas,
sem cache de inicialização possivelmente obsoleto. Liberar em finally; destruir
o client com release(error) se a preparação/verificação falhar, sem executar ou
repetir a consulta de negócio. Não repetir escritas em erro de rede.

Esse SET é de sessão, não permanente no banco/role; é apropriado ao modo session
validado aqui. Custa duas consultas adicionais por aquisição. Não basta chamar
pool.query('SET ...') separado da query, pois podem cair em conexões diferentes.
Também não usar listener async do evento connect como barreira: o emitter não
aguarda a Promise. Transações futuras precisam manter um único client durante
toda sua duração e podem usar SET LOCAL com verificação no início da transação.
Não embrulhar silenciosamente cada operação atual numa transação nova.

Antes de aplicar ao backend: aprovar estratégia, testar clientes simultâneos,
reuso/substituição, falha de SET/SHOW, liberação, ausência de replay e contratos
existentes. Nenhum ajuste de pool ou primeira conta foi feito nesta etapa.

## Diagnóstico Node isolado com dc_runtime

Comando de leitura preparado, ainda sem execução remota:

```powershell
npm.cmd --prefix 'C:\Users\David Mangueira\OneDrive\Documentos\ChatGPT\DespachanteControl\backend' run diagnose:supabase -- --env-file 'C:\Users\David Mangueira\supabase\despachante-control-hml.env'
```

Crie/preencha o arquivo privado no editor local, fora do OneDrive e do repositório.
O diagnóstico não cria esse arquivo nem imprime seu conteúdo. Use estes campos:

```dotenv
DB_PROVIDER=postgres
PG_HOST=aws-0-us-east-2.pooler.supabase.com
PG_PORT=5432
PG_DATABASE=postgres
PG_USER=dc_runtime.zhonseyahndqlzoygolr
PG_PASSWORD=
PG_SSL_MODE=verify-full
PG_SSL_CA_FILE=C:/Users/David Mangueira/supabase/prod-ca-2021.crt
PG_CONNECTION_TIMEOUT_MS=5000
PG_IDLE_TIMEOUT_MS=30000
PG_STATEMENT_TIMEOUT_MS=15000
```

Preencha PG_PASSWORD somente no arquivo privado; não envie ao chat. Respeite a
sintaxe dotenv: valores contendo # devem estar entre aspas, escolhendo delimitador
que preserve a senha exata. Nenhuma senha administrativa ou SESSION_SECRET é
necessária. Não reutilizar essa configuração para o helper administrativo.

O arquivo exige caminho absoluto, resolve links e recusa caminhos dentro do
projeto ou de diretórios OneDrive reconhecidos pelo nome. Não altera process.env
e não importa dotenv/config. Reutiliza readPostgresConfig, adicionando somente
default_transaction_read_only ao startup do diagnóstico. Usa Client dedicado,
BEGIN READ ONLY e ROLLBACK, sem servidor HTTP ou pool compartilhado; o encerramento
da conexão também desfaz uma transação interrompida. Não há retry.

Somente SELECTs fixos: identidade/versão/configurações, contagem de tipos e usuários
e View do Dashboard com valores decimais textuais. Não consulta nomes, e-mails ou
hashes. A saída seleciona campos explicitamente; erros são genéricos, sem stack,
mensagem bruta, senha ou connection string. O sucesso da conexão usa a política
TLS verify-full existente; não reporta uma versão TLS negociada que não mediu.
Supavisor precisa aceitar o startup read-only: se rejeitar, o comando falha sem
reduzir segurança. Esta verificação não inicia autenticação nem cria a primeira conta.

## Retomada UTF-8 no Windows — 08/11/2026

Tentativa remota relatada falhou com bytes e7 e3 6f ("ção" em Windows-1252,
inválidos como UTF-8). A verificação manual posterior não encontrou schemas ou
roles da aplicação. Os arquivos SQL locais são UTF-8 válido; a hipótese principal
é a passagem de comentários acentuados por argumento nativo `psql -c` no Windows,
não corrupção das migrações. Sem linha/contexto do erro, a origem não é conclusiva.
`$OutputEncoding` governa pipelines e não corrige necessariamente argumentos -c.

Usar agora `database/postgresql/deployment/invoke-hml.ps1`. Ele é ASCII, verifica
UTF-8 estrito e os cinco hashes, confirma destino com SELECT, fixa client_encoding
UTF8 na conexão e PGCLIENTENCODING temporariamente, preserva verify-full/CA/-W/-X/
ON_ERROR_STOP, e envia texto acentuado apenas via arquivo -f. Não há pipeline de
SQL, senha em argumento ou alteração de .env. O diagnóstico usa uma palavra UTF-8
e verifica seus bytes; não depende apenas de como o terminal renderiza acentos.

Somente leitura (não executado remotamente pelo agente):

```powershell
& .\database\postgresql\deployment\invoke-hml.ps1
```

Somente APÓS nova autorização de implantação:

```powershell
& .\database\postgresql\deployment\invoke-hml.ps1 -Apply
```

O modo padrão impõe default_transaction_read_only e não inclui apply.psql.
O modo Apply pede confirmação textual, repete o diagnóstico antes da instalação
na mesma conexão e executa apenas apply.psql como escrita. Nunca repete operação.
Guard rejeita roles/schemas já existentes. Em erro/perda de conexão, revisar estado
antes de nova tentativa. As consultas pós-instalação do roteiro anterior continuam
necessárias; runtime e primeira conta permanecem fora desta autorização.
Não usar novamente os antigos here-strings acentuados em -c.

## Atualização 4.2B — preparação local, execução remota NÃO autorizada

O usuário informou projeto `despachante-control-hml`, Free, Ohio, PostgreSQL17.11,
UTF8/ICU/NFC, Data API desativada, postgres como usuário/banco, CREATEROLE e CREATE
no banco, sem schema app. Estas informações substituem o estado histórico abaixo;
não foram verificadas por uma conexão remota nesta preparação.

Arquivos administrativos novos:
- `database/postgresql/deployment/apply.psql`: instalação inicial transacional;
  inclui bootstrap e001–005, advisory lock, ledger com SHA-256 e ON_ERROR_STOP.
  Recusa schema preexistente; não é runner de upgrades nem limpeza de instalação.
- `database/postgresql/deployment/runtime.sql`: cria login sem senha e somente
  associação dc_api com ADMIN FALSE, INHERIT TRUE, SET FALSE. Recusa runtime já
  existente e CREATE concedido a PUBLIC em schema/banco; não altera objetos do provedor.
- `backend/src/scripts/create-postgres-first-user.ts`: comando administrativo
  interativo, sem dotenv, com variáveis ADMIN_PG_* separadas e TLS obrigatório.
  Substitui, para PostgreSQL, a proposta de ferramenta ainda pendente descrita abaixo.

Bootstrap agora verifica identidades/associações antes de mudanças, exige CREATE
WITH GRANT OPTION e explicita ADMIN FALSE, SET TRUE, INHERIT FALSE na associação do
administrador a dc_migrator. dc_api/dc_migrator não recebem LOGIN nem pertencem a
outros papéis. Associações administrativas automáticas do provedor não são revogadas.
No teste sem SUPERUSER, tentar ADMIN TRUE no grant adicional para o próprio
administrador falhou com SQLSTATE0LP01. ADMIN FALSE nessa associação evita o ciclo;
o ADMIN automático concedido pelo criador/superusuário permanece intacto.
O administrador conserva capacidade de administrar; a separação impede que essas
credenciais sejam usadas no processo Express, não tenta limitar o proprietário.

### Ordem exata após autorização remota separada

1. Confirmar project reference/host no painel, versão, Data API desligada e TLS.
   Executar preflight somente leitura. Conferir `CREATE WITH GRANT OPTION` e
   `CONNECT WITH GRANT OPTION`, roles preexistentes e ausência de app/dc_migrations.
   Confirmar linguagens SQL/plpgsql e privilégios efetivos/PUBLIC. Qualquer divergência
   interrompe o procedimento; não criar permissões adicionais para contornar erro.
2. Revalidar SHA-256 dos arquivos001–005 contra o manifesto de apply.psql. O teste
   de implantação também faz essa comparação. Preservar os bytes dos arquivos;
   conversão CRLF/LF requer revisar manifesto antes de executar, não ignorar mismatch.
3. Em terminal privado, sem transcript, usar psql compatível com17, conexão direta
   quando possível ou session pooler já homologado. Não incluir senha na URL.
   Configurar privadamente PGHOST/PGPORT/PGDATABASE/PGUSER e PGSSLROOTCERT para o
   destino administrativo escolhido; `PGSSLMODE=verify-full`. Essas são variáveis
   do cliente psql, não as variáveis PG_* do backend. Senha somente no prompt `-W`.
4. Após conferir novamente o destino e obter autorização, executar da raiz:

   ```powershell
   # SOMENTE na futura execução autorizada; nenhuma senha em argumentos.
   psql -X -W -v ON_ERROR_STOP=1 -f database/postgresql/deployment/apply.psql
   if ($LASTEXITCODE -ne 0) { throw 'Implantação interrompida; revisar antes de repetir.' }
   ```

   psql encerra no erro e sua desconexão desfaz a transação aberta. Um erro de
   conexão na confirmação de COMMIT exige verificar estado/ledger antes de repetir.
   Não executar no SQL Editor: o arquivo contém metacomandos psql `\ir`.
5. Conferir como migrador: ownership, cinco versões/checksums, seis tabelas,
   duas Views, função, cinco UNIQUE, FKs e seis triggers; quatro tipos e demais
   tabelas vazias. Verificar grants explícitos, herdados e default privileges,
   inclusive ausência de acesso de anon/authenticated/service_role. Não presumir
   que desativar Data API corrige grants indevidos; interromper se encontrados.
6. Executar runtime.sql como administrador com ON_ERROR_STOP. Ele é um DO atômico,
   sem senha. Se falhar, não reparar identidades automaticamente. Definir senha
   forte por `\password dc_runtime` numa sessão psql privada; não emitir ALTER ROLE
   com senha literal. Não conceder dc_migrator ao runtime.
7. Validar conexão runtime separadamente, suas associações e grants. O runtime
   deve ler Views/usuários, mas não SET ROLE dc_api/dc_migrator, DDL no app ou
   administração de contas. TEMP/CONNECT via PUBLIC não significam DDL persistente;
   verificar funções públicas e schemas do provedor sem revogações globais cegas.
8. Preparar primeira conta: definir ADMIN_PG_HOST, ADMIN_PG_PORT, ADMIN_PG_DATABASE,
   ADMIN_PG_USER, ADMIN_PG_SSL_CA_FILE privadamente no processo; nenhuma variável
   de senha é usada pelo comando. Após autorização específica para a conta:

   ```powershell
   Set-Location backend
   npx --no-install tsx src/scripts/create-postgres-first-user.ts
   ```

   O comando pede confirmação textual de host/banco/usuário ANTES de conectar,
   senha administrativa oculta, nome/e-mail e senha da conta oculta com confirmação.
   Verifica identidade retornada, usa bcrypt12 e NFC apenas em nome/e-mail, transação
   dedicada, SET LOCAL ROLE dc_migrator, lock da tabela e recusa usuário existente.
   INSERT parametrizado; saída apenas sucesso/ID ou erro sanitizado. Não há rota
   pública nem credencial administrativa na API. Senhas/hashes existem apenas em
   memória; JavaScript não garante apagamento físico imediato após encerrar.
   Não habilitar logging SQL/parâmetros/auditoria de payload nesta operação; revisar
   política de logs do destino antes de criar a conta. Não usar user:prepare T-SQL.
9. Encerrar terminal administrativo. Configurar API somente com dc_runtime,
   TLS verify-full e variáveis de runtime. Homologar login/CSRF/logout, negações de
   privilégios, Unicode, datas e financeiro no ambiente autorizado. Não importar dados.

Teste local de implantação usa um administrador NOSUPERUSER CREATEROLE, com
grant options explicitamente concedidas pelo dono do cluster descartável. Isso
testa semântica PostgreSQL, não reproduz hooks, grants ou restrições Supabase.
PG17.11 remoto, handshake TLS e privilégios efetivos ainda precisam de homologação.
Os comandos desta seção NÃO foram executados remotamente.

Resultados desta preparação: 107 testes backend, 36 testes de integração PostgreSQL
(35 HTTP existentes +1 administrativo novo) e20 testes SQL aprovados. TypeScript,
build e diff --check aprovados. Integração real executada no PostgreSQL18.4 local;
binário17 não está disponível no caminho padrão. As migrações001–005 conservaram
seus SHA-256. O teste administrativo expande os includes de apply.psql e executa
o SQL na mesma conexão, como usuário sem SUPERUSER; valida rollback, manifestos,
recusa de repetição, permissões e bcrypt12. A invocação interativa psql e a entrada
oculta da CLI exigem ensaio manual antes de uso remoto; a lógica de primeira conta
foi executada somente com dados sintéticos no cluster descartável.

---

Registro histórico da Etapa4.1 (as pendências de ferramentas acima já preparadas
substituem as descrições históricas correspondentes):

Estado: revisão local; nenhum projeto remoto criado ou conectado. SQL Server segue
como padrão. Este guia não autoriza executar a Etapa 4.2. Não usar dados pessoais
reais no piloto. React continua usando somente `/api`; Express usa `pg`, sem
Supabase Auth, SDK no navegador ou credenciais `VITE_*`.

## Compatibilidade e condições de liberação

Foram revisados bootstrap, migrações 001–005, repositórios e configuração do pool.
Não foi identificada necessidade de modificar as migrações antes de conhecer o
destino. PostgreSQL 18.4 local não comprova compatibilidade com o Supabase.

| Dependência | Situação e verificação necessária |
| --- | --- |
| UTF-8 e ICU | `normalize(..., NFC)`, collation ICU não determinística `und-u-ks-level2`; confirmar build e versão ICU remotos |
| PostgreSQL | Views `security_invoker` exigem PG >=15; o roteiro local recomenda >=16. PG17 e a versão efetiva do projeto ainda precisam de execução da suíte |
| Extensões | Nenhum CREATE EXTENSION; funções SQL/plpgsql, JSONB, identity e NUMERIC nativos |
| Unicode | 005 normaliza campos permitidos em triggers; cinco índices usam text_key; caixa, acentos e espaços seguem UNICODE.md. Hashes não são normalizados |
| Permissões | CREATE ROLE, concessão de CREATE no banco, associação e SET ROLE dc_migrator; não exigir SUPERUSER |
| Datas | DATE e timestamp(6) sem fuso para datas de negócio; instantes de cadastro UTC. API rejeita sete casas, não arredonda silenciosamente |
| Dinheiro | NUMERIC, strings decimais nas respostas; nenhum cálculo financeiro em JavaScript; cancelados incluídos e custo zero sem despesas |

Executar futuramente [preflight somente de leitura](../database/postgresql/verification/supabase-preflight.sql)
com destino confirmado. O nome `postgres` do banco não identifica um projeto:
comparar também organização, project reference e hostname do painel Connect.
Registrar versão, encoding e ICU, sem salvar credenciais ou respostas de usuários.
Resultado vazio de schema app é esperado antes da instalação. ICU presente não
prova equivalência: executar os casos NFC/NFD, acentos, caixa, espaços, ß/ss e æ/ae.
Não atualizar collation/reindexar automaticamente após mudança de versão ICU.

## Projeto novo: ações manuais somente na Etapa 4.2

1. Criar projeto **Free** separado, conferir organização/plano e não ativar add-ons
   pagos. Escolher região próxima do backend Render, considerando também latência
   do público e requisitos de localização de dados. Guardar senha administrativa
   em gerenciador de senhas; não colar em chat, arquivos do projeto ou comandos.
2. Identificar versão efetiva com preflight e painel; obter endpoints pelo Connect,
   sem construir hostname do pooler por inferência. Não reutilizar o banco local.
3. Desabilitar a Data API, que não é utilizada. Confirmar que `app` e `dc_migrations`
   não constam nos schemas expostos. Não conceder privilégios a anon, authenticated,
   service_role ou authenticator sobre esses schemas. Verificar grants explícitos,
   herdados e defaults do proprietário: revogar PUBLIC não elimina outros grants.
4. Habilitar SSL enforcement, revisar restrições de rede para as origens autorizadas
   e guardar a CA obtida no painel em armazenamento privado. Não abrir SQL Server.
5. Antes de qualquer escrita, confirmar explicitamente project reference, host,
   banco, identidade administrativa e ausência de schema/dados app inesperados.
   Interromper se houver objetos ou roles não reconhecidos; nunca apagar para resolver.

O schema não é exposto pelo código das migrações, mas **a configuração real da
Data API ainda não foi verificada**. RLS não substitui grants nem autenticação
Express. Não criar políticas públicas; a aplicação atual não tem isolamento entre
empresas e todos os usuários ativos têm as mesmas permissões de negócio.

## Conexão e TLS

Preferir conexão direta para administração, migração e backup quando IPv6 estiver
disponível. Para Express persistente em rede IPv4, usar **Supavisor session mode**,
porta e host do painel (normalmente 5432). Não usar transaction mode/6543 nesta
homologação. Em conexão direta o usuário é `dc_runtime`; no pooler é
`dc_runtime.<project-ref>`. Confirmar suporte do login próprio no destino.

Configurar privadamente, sem alterar o .env local:

| Variável | Valor |
| --- | --- |
| DB_PROVIDER | postgres |
| PG_HOST / PG_PORT | DNS e porta exatos de Connect, sem URL; não substituir DNS por IP |
| PG_DATABASE | banco informado pelo painel, normalmente postgres |
| PG_USER / PG_PASSWORD | login exclusivo da API e sua senha privada, não postgres nem dc_migrator |
| PG_SSL_MODE | verify-full |
| PG_SSL_CA_FILE | caminho do arquivo CA confiável disponibilizado para aquele endpoint, se necessário |
| PG_POOL_MAX | padrão 10; dimensionar por orçamento de conexões e número de processos, deixando reserva administrativa |
| PG_CONNECTION_TIMEOUT_MS | 5000, preservado |
| PG_IDLE_TIMEOUT_MS | 30000, preservado |
| PG_STATEMENT_TIMEOUT_MS | 15000, preservado |

`pg` usa rejectUnauthorized=true e o hostname como servername TLS. CA incorreta,
certificado vencido e hostname incompatível devem falhar. Nunca usar
NODE_TLS_REJECT_UNAUTHORIZED=0, rejectUnauthorized=false ou sslmode=require como
substituto de verificação. A CA do endpoint direto pode diferir da cadeia do pooler:
validar cada endpoint, não contornar erro. Senhas em campos separados não precisam
de percent-encoding de URL. Nenhuma variável PG_* deve entrar no build React.

O backend envia `options=-c timezone=UTC` e statement_timeout no startup. Confirmar
`SHOW TimeZone` e `SHOW statement_timeout` **usando pg e o login runtime através do
endpoint escolhido**. Se Supavisor rejeitar/ignorar parâmetros, parar e propor
adaptação antes de alterar o código. O preflight via psql não prova esse handshake.
`pg_stat_ssl` através do pooler descreve a conexão upstream; não comprova sozinho
TLS entre Node e pooler. Testar também a validação TLS no cliente Node.

Pool lazy compartilhado, sem Promise rejeitada permanente e sem repetição de
escritas. Erros em clientes ociosos são tratados; novas aquisições ficam a cargo de
pg. Isso não garante recuperação de suspensão remota: validar indisponibilidade,
retorno e ausência de duplicação. Não mudar timeouts para mascarar falha.

Render/same-origin/cookies Secure seguem [HOSTING.md](HOSTING.md), substituindo
somente as variáveis de banco Azure daquele roteiro pelas PG_* acima. APP_MODE=hosted,
NODE_ENV=production, origem HTTPS exata, proxy restrito, PORT fornecida pelo Render.
Sessões em memória desaparecem ao reiniciar; nenhuma mudança de autenticação aqui.

## Bootstrap e migrações: procedimento administrativo

Supabase fornece postgres com privilégios gerenciados, não SUPERUSER irrestrito.
Não usar scripts que dependam de superusuário, ALTER SYSTEM ou criação de outro
banco. Usar o banco já fornecido pelo projeto, criando apenas schemas privados.

Após autorização e preflight, revisar/aplicar `database/postgresql/bootstrap.sql`
como administrador. Ele cria dc_migrator/dc_api NOLOGIN sem senha e rejeita atributos
perigosos. Verificar autorização para GRANT/SET ROLE; em caso de erro de membership
ou propriedade, parar, não conceder superuser/BYPASSRLS nem ampliar privilégios.
Não está comprovado que o papel gerenciado aceitará todos esses GRANTs.

Aplicar 001_schema, 002_financeiro, 003_tipos_servico, 004_permissoes e
005_unicode_nfc nessa ordem, em uma transação sob `SET LOCAL ROLE dc_migrator`,
com parada no primeiro erro. Registrar SHA-256 e versão em ledger privado;
`tests/migrate.mjs` já demonstra transação, advisory lock e verificação de checksum,
mas é exclusivo dos testes: **não apontar o harness a um banco permanente**.
Preparar/revisar o runner administrativo com confirmação do destino na Etapa 4.2.
Não colar migrações isoladamente sob postgres: ownership e default privileges
dependem de serem executadas pelo migrador. Não editar arquivo já aplicado.

Conferir seis tabelas, duas Views, função financeira, cinco índices UNIQUE, FKs,
triggers NFC e apenas quatro tipos iniciais idempotentes. As outras tabelas devem
estar vazias. Não importar dump ou fixtures do SQL Server/cluster de testes.

Criar separadamente um LOGIN dc_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE
NOBYPASSRLS INHERIT, membro somente de dc_api; definir sua senha via prompt seguro
administrativo (por exemplo `\password dc_runtime` em psql, sem echo/transcript).
Conferir membership herdado, CONNECT e ausência de CREATE em schemas acessíveis.
Não conceder dc_migrator ao runtime. Não usar uma senha na sentença CREATE ROLE.

Permissões previstas: SELECT/INSERT/UPDATE cliente/veiculo/servico; também DELETE
somente despesa; SELECT usuario/tipo/Views; USAGE nas quatro sequências de negócio;
EXECUTE text_key, parse_timestamp e resumo_financeiro_servico. API não cria contas,
não muda hashes e não executa DDL. Conferir negações usando o login real, não admin.

## Primeira conta — procedimento preparado, execução pendente

Não executar `npm run user:prepare` para PostgreSQL: o helper atual gera T-SQL e
imprime o hash. Não colocar hash no SQL Editor, histórico, migração ou relatório.

Na Etapa 4.2, preparar/revisar ferramenta administrativa de execução única:

1. Receber nome/e-mail e senha com confirmação em terminal privado, senha oculta,
   sem argumentos de linha de comando, transcript, arquivo ou logging de payload.
2. Reutilizar limites de nome/e-mail e senha do helper atual (8 a 12 caracteres,
   contados como pontos de código Unicode); NFC somente nos campos de negócio, nunca na senha.
   O bcrypt continua com custo 12. A validação informa códigos específicos para tamanho,
   confirmação diferente, nome ou e-mail inválido, sem imprimir os dados recebidos.
3. Confirmar destino antes de conectar; usar credencial administrativa temporária
   separada, TLS verificado e nunca carregada pelo processo normal da API.
4. bcrypt custo 12 em memória; transação sob migrador, lock exclusivo na tabela
   usuario e verificar que está vazia antes do INSERT parametrizado de nome, e-mail,
   hash e ativo=true. Se não vazia, abortar, sem resetar conta existente.
5. COMMIT somente da conta solicitada; exibir apenas sucesso/ID, nunca hash, senha,
   token ou resposta de login completa. Em erro, rollback e mensagem sanitizada.
6. Encerrar conexão e retirar credencial administrativa do processo; testar login
   e logout com runtime. Não há coluna de perfil administrador no modelo atual.

Essa ferramenta não foi implementada nem executada nesta etapa. É uma condição
explícita antes da criação da conta, não uma orientação para inserir hash à mão.

## Homologação reproduzível e critérios de aprovação

Local, sem destinos externos e sem .env:

```powershell
$env:PG_TEST_BIN = 'C:\Program Files\PostgreSQL\18\bin'
npm.cmd --prefix database/postgresql test
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:postgres
npm.cmd --prefix backend run typecheck
npm.cmd --prefix backend run build
```

Repetir com binários da mesma major do destino quando disponíveis. Cada harness
cria/remove exclusivamente seu próprio cluster. Não transformar estas suítes em
testes remotos mudando URLs. Preparar homologação remota separada, autorizada, com
fixtures sintéticas identificadas e sem DROP/TRUNCATE/limpeza indiscriminada.

| Verificação remota pendente | Critério |
| --- | --- |
| TLS | pg conecta com CA/hostname válidos; CA e hostname inválidos falham; plaintext recusado pelo servidor |
| Privilégios | runtime lê/escreve apenas operações permitidas; DDL, INSERT usuario e DELETE cliente negados; Data API sem acesso a app |
| Autenticação | login 200, me 200, logout 204, me 401; inativo negado; escrita sem CSRF 403; cookie Secure/HttpOnly |
| Cadastros | GET/POST/PUT clientes, veículos e serviços; GET tipos; CRUD despesas e consulta por serviço; inexistentes 404, duplicidades 409 |
| Integridade | FKs, concorrência UNIQUE, solicitante diferente do proprietário, CONCLUIDO exige data; sem DELETE novo |
| Financeiro | receita150.01/despesa10.02 =139.99 exatamente; múltiplas despesas, zero, cancelados, atualização/exclusão refletem Views/função/HTTP sem dupla soma |
| Unicode/tempo | NFC/NFD, acentos/caixa/espaços; senha byte-exata; 6 casas aceitas e 7 rejeitadas; datas sem deslocamento; centavos/limites/JSON strings |
| Falhas | indisponibilidade controlada em homologação, retomada, timeout, sem replay de escrita, nenhuma informação interna no HTTP |
| Navegador | React same-origin, sessão/F5/rotas, CSRF e logout; nunca imprimir cookies/tokens; validar erro e vazio |
| Restauração | restaurar backup em destino novo isolado, comparar contagens/ledger/finanças/grants e repetir login; não sobrescrever o piloto |

Os testes locais não comprovam TLS remoto, topologia Render, quotas, privilégios
gerenciados, disponibilidade, nem recuperação do Supavisor. A falha intermitente
SQL Server anterior também não deve ser considerada diagnosticada por esta migração.

## Backup, restauração e limites

Free: a documentação consultada informa banco de 500 MB e possibilidade de pausa
após período de baixa atividade de sete dias. Conferir limites/plano no painel antes
da criação; sem promessa de disponibilidade operacional. Não habilitar IPv4 pago,
PITR ou upgrade automaticamente. Render Free também pode reiniciar/suspender e
as sessões em memória são inadequadas para operação confiável.

Programar exportação própria para armazenamento privado criptografado fora do
repositório; não depender de backup restaurável do plano Free. Usar pg_dump de
versão compatível com o servidor, conexão direta TLS validada e senha via prompt,
sem connection string na linha de comando. Exportar app e dc_migrations em formato
custom; registrar checksums e versão. O dump inclui hashes/dados: tratar como segredo.
Não exportar roles/senhas globais ou schemas internos Supabase.

Ensaio de restauração autorizado: projeto/cluster novo, confirmar destino vazio,
bootstrap dos papéis, restaurar sob dc_migrator com ownership/ACL revisados, sem
--clean em banco existente; reaplicar grants004 e verificar triggers/índices/ledger.
Não aplicar novamente 001 sobre objetos restaurados. Criar runtime com senha nova,
validar sequência identity após restore, contagens, resultado financeiro e login.
Testar se o dump seletivo inclui todas as dependências antes de considerá-lo backup
útil. Se só houver IPv4, validar o caminho session pooler para a ferramenta antes
do ensaio; não trocar para transaction pooler. Definir retenção, frequência, RPO/RTO
e responsável; uma exportação sem restauração testada não encerra esta pendência.

## Fontes oficiais e próximo passo

Consultadas em 05/11/2026; confirmar no momento da implantação:

- [Conexões e endereços](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Papéis gerenciados](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [Roles](https://supabase.com/docs/guides/database/postgres/roles)
- [Segurança Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Backups](https://supabase.com/docs/guides/platform/backups)
- [Plano e limites](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Pausas](https://supabase.com/docs/guides/platform/free-project-pausing)

## Resultado local desta preparação

Em 05/11/2026: 107 testes backend, 35 testes HTTP PostgreSQL e 20 testes SQL
aprovados, sem falhas ou casos ignorados. SQL/HTTP executados no PostgreSQL18.4
real descartável; a regressão SQL Server usa mocks. O novo teste executa o
preflight antes e depois das migrações. TypeScript, build e git diff --check
aprovados. Os arquivos novos também foram verificados quanto a whitespace.
Não foram executados testes de navegador nesta etapa documental, nem testes
remotos ou de TLS real. Migrações001–005 e código de produção não foram alterados.

4.2 começa somente com autorização: criar projeto novo, confirmar versão/ICU e
endpoints, executar preflight, resolver privilégios, revisar runner/primeira conta
e homologar TLS antes de migrar. Nenhum desses passos remotos foi executado em 4.1.
# Backend local com Supabase HML: autenticação

Use somente o Session pooler na porta 5432 com `dc_runtime`, CA e TLS
`verify-full`. O arquivo privado permanece fora do projeto e do OneDrive:
`C:/Users/David Mangueira/supabase/despachante-control-hml.env`.
As variáveis obrigatórias são `DB_PROVIDER=postgres`, `PG_HOST`, `PG_PORT`,
`PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `PG_SSL_MODE=verify-full` e
`PG_SSL_CA_FILE`. Não imprima o arquivo nem forneça senha como argumento.

```powershell
Set-Location 'C:\Users\David Mangueira\OneDrive\Documentos\ChatGPT\DespachanteControl\backend'
npm.cmd run build
node dist/server.js --hml-env-file 'C:/Users/David Mangueira/supabase/despachante-control-hml.env'
```

Essa opção não carrega `backend/.env`, não combina as variáveis privadas com
`process.env` e valida o destino HML e a identidade runtime. Força modo local,
`127.0.0.1:3001`, timeout de 15000 ms e origens exatas
`http://127.0.0.1:3001` e `http://127.0.0.1:5173`.
Sem essa opção, a inicialização local/hosted anterior permanece disponível.
O comando acima inicia uma API com operações de negócio habilitadas; o teste
abaixo chama somente saúde/autenticação e não deve ser acompanhado de testes CRUD.

Se houver `SESSION_SECRET` no arquivo privado, ele deve conter pelo menos 64
caracteres hexadecimais aleatórios. Se ausente, gera-se um segredo aleatório
efêmero em memória, nunca exibido. As sessões também ficam em memória e são
perdidas ao reiniciar. O cookie continua HttpOnly e SameSite=Strict; Secure=false
é aplicado exclusivamente neste modo HTTP loopback. Não publicar nem usar túnel
com essa configuração. A conexão PostgreSQL continua com TLS validado.

O pool aguarda `set_config('statement_timeout', ..., false)` e verifica
`pg_settings` antes de cada consulta, na mesma conexão obtida do pool. Isso vale
para conexões novas e reutilizadas. O ajuste é de sessão, não altera banco,
papéis ou arquivos globais. Falha de configuração/verificação impede a consulta;
a conexão é descartada em caso de erro, sem repetir a operação. Há duas consultas
adicionais por operação. Essa estratégia pressupõe conexão direta ou Session
pooler, não Transaction pooler. O timeout limita cada instrução, não a duração
total da requisição HTTP nem a espera por conexão.

Em um segundo PowerShell privado, execute manualmente:

```powershell
Set-Location 'C:\Users\David Mangueira\OneDrive\Documentos\ChatGPT\DespachanteControl\backend'
& .\scripts\test-local-hml-auth.ps1
```

A política de execução do Windows pode bloquear arquivos `.ps1`. Não foi alterada
nem contornada nesta preparação. Se houver bloqueio, interrompa e trate a permissão
de execução conforme a política do computador antes de continuar. A sintaxe do
roteiro foi validada; sua execução simulada foi bloqueada neste ambiente. Os fluxos
HTTP de autenticação foram cobertos pelos testes automatizados Node.js com mocks.

O script pede e-mail e senha da aplicação (não a senha PostgreSQL), preserva o
cookie em WebRequestSession e imprime somente etapas/status. Verifica health e
health/db (200), acesso sem sessão (401), login (200), recuperação por me (200),
logout sem CSRF (403), sessão ainda válida (200), logout com CSRF (204) e me (401).
Confere ID 1 sem imprimir dados pessoais, tokens, cookies ou hashes. Interrompe
se houver erro de rede, resposta inesperada ou HTTP diferente do esperado; HTTP
0 não é sucesso. Não use transcript/debug/proxy de captura de requisições.
Se o teste parar após login, a sessão pode continuar em memória até expirar;
encerre o backend com Ctrl+C para invalidá-la antes de investigar.

Validação remota desses ajustes ainda depende da execução manual. Testes locais
utilizam banco e HTTP simulados; não comprovam a conexão real com o Supabase.
