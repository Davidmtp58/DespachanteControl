# PostgreSQL — Etapas 2 e 2.1 (banco descartável)

Alvo futuro: Express no Render Free, React servido pelo Express, PostgreSQL no
Supabase Free. Nenhum recurso remoto é criado por esta pasta. Nenhuma alteração
foi feita nos repositórios, autenticação, frontend ou scripts SQL Server originais.

## Executar testes no Windows

Pré-requisitos: Node >=22 e binários PostgreSQL >=16 compilados com ICU. Os testes
foram preparados para PostgreSQL 18 local; a versão efetiva aparece no resultado.
Não é preciso instalar dependências npm nem iniciar o serviço PostgreSQL existente.

Na raiz do repositório, em PowerShell:

```powershell
$env:PG_TEST_BIN = 'C:\Program Files\PostgreSQL\18\bin'
npm.cmd --prefix database/postgresql test
```

`PG_TEST_BIN` apenas seleciona executáveis, nunca um banco. O harness ignora
variáveis PG* herdadas, não lê .env e não aceita DATABASE_URL/host remoto. Cria um
cluster novo com `initdb`, senha aleatória, SCRAM, porta livre e listen_addresses
127.0.0.1. Testa via psql real (sem mocks/SQLite/PGlite). Não concede acesso de rede.

Cada execução cria um cluster em `.test-clusters/dc-pg-test-*`, aplica migrações e
encerra/remove somente a pasta criada por ela. Antes de remover, verifica caminho
absoluto real, prefixo e marcador aleatório de propriedade. Reexecutar o comando
recria tudo do zero. Falhas de inicialização/encerramento preservam a pasta para
diagnóstico; não limpar automaticamente um processo com estado incerto. Não
executar comandos DROP ou limpeza em um banco fornecido pelo usuário.

initdb usa --no-sync apenas neste cluster descartável, para reduzir o custo de
criação; não reutilizar essa opção como orientação de durabilidade em produção.
No Linux, definir PG_TEST_BIN para o diretório correspondente. initdb deve rodar
como usuário comum, não root. Isso é ferramenta de desenvolvimento, não comando
de build/start do Render. O TLS externo será validado na etapa de conexão, não
neste teste exclusivamente loopback.

## Arquivos e ordem

- `bootstrap.sql`: preparação administrativa de dois papéis NOLOGIN; nenhum
  usuário/senha real. Concede ao migrador criação no banco selecionado e associação
  ao administrador que o executou. Revisar a conta administrativa antes de uso futuro.
- `001_schema.sql`: schema privado app, helpers, seis tabelas, PK/FK/CHECK,
  cinco índices UNIQUE e os três índices operacionais originais.
- `002_financeiro.sql`: duas Views e função de leitura equivalente à procedure.
- `003_tipos_servico.sql`: quatro tipos, ON CONFLICT DO NOTHING; sem usuários,
  clientes, veículos, serviços ou despesas.
- `004_permissoes.sql`: permissões mínimas de execução.
- `005_unicode_nfc.sql`: política NFC explícita, reconstrução dos cinco índices
  de unicidade e triggers de normalização; sem alterar as migrações anteriores.
- `UNICODE.md`: inventário de campos/índices/operações, obrigações do futuro
  adaptador, compatibilidade de versões e plano da Etapa 3.
- `tests/migrate.mjs`: runner exclusivo do harness; transação, advisory lock e
  histórico com SHA-256 em schema privado dc_migrations. Reaplica sem duplicar;
  recusa checksum divergente. Não editar migrações depois de aprovadas/aplicadas
  em ambiente persistente; esta versão ainda é candidata em homologação.

O ledger é infraestrutura, fora das seis tabelas de negócio. Não existem scripts
down destrutivos. Não há conexão Supabase, login provisionado, driver novo no
backend nem seletor de persistência nesta etapa.

## Collation verificada e política Unicode aprovada

Consulta somente de leitura em 26/10/2026 confirmou `Latin1_General_CI_AS` no
banco e nas colunas textuais das seis tabelas. Metadados e comparações sintéticas
foram consultados; não houve leitura de cadastros. Script reproduzível em
`verification/sqlserver-collation.sql`.

| Pares | SQL Server varchar | SQL Server nvarchar |
| --- | --- | --- |
| A / a | iguais | iguais |
| Jose / José | diferentes | diferentes |
| abc / abc com espaço final | iguais | iguais |
| é / e + acento combinante | diferentes | iguais |
| straße / strasse | iguais | iguais |
| æ / ae | iguais | iguais |
| a-b / ab | diferentes | diferentes |

ICU `und-u-ks-level2`, não determinística, mantém as comparações CI_AS testadas.
Índices UNIQUE usam `app.text_key` (NFC, remoção de espaços U+0020 finais,
normalização de caixa e expansões ß/ss e æ/ae) e COLLATE explícito. Essa chave não
substitui o texto de exibição; triggers aplicam somente NFC ao armazenamento.
O futuro adaptador precisa usar a mesma chave
e collation nas pesquisas por igualdade, sobretudo e-mail/placa/documento:

```sql
SELECT id_usuario FROM app.usuario
WHERE app.text_key(email) COLLATE app.ci_as = app.text_key($1) COLLATE app.ci_as;
```

Na Etapa 2.1, a diferença entre formas canônicas passou a ser intencional e
autorizada: o banco novo usa NFC, sem reproduzir perda de caracteres da code page
legada. Caixa, acentos e espaços de exibição são preservados. Não há promessa de
ordenação universal idêntica à collation Windows. Hash bcrypt continua byte-exato.
Consulte [a política detalhada](UNICODE.md), incluindo a ressalva de execução em
PostgreSQL 17. Nenhuma autorização de publicação decorre desses testes.

## Datas — decisão de seis casas, sem arredondamento silencioso

Início/conclusão: timestamp(6) sem fuso. `app.parse_timestamp(text)` aceita ISO
local com 0–6 casas e rejeita 7 casas (inclusive sétima zero), Z, offset, hora 24
e datas impossíveis. SQLSTATE 22007/22008 deverá virar validação HTTP no adaptador
futuro. Esta etapa não muda o validador SQL Server de sete casas.

IMPORTANTE: cast PostgreSQL direto para timestamp(6) arredonda antes de triggers
ou CHECKs. A função não consegue proteger uma entrada previamente convertida.
O futuro adaptador deve validar o JSON original e enviar texto ao parser; não
usar `Date`, cast prévio, nem o valor normalizado para sete casas pelo validador
antigo. Instruções administrativas SQL diretas podem ignorar esse parser; não
confundir validação de entrada com capacidade nativa do tipo timestamp.

Cadastro: timestamptz(6), default clock_timestamp(), representa instante. Os
testes demonstram projeção explícita em UTC com formato ISO milissegundos + Z
para Cliente/Veículo/Usuário e ISO sem Z para Serviço, invariantes ao timezone
da sessão. A API atual não é alterada. A futura integração do driver ainda
precisa repetir os testes HTTP para confirmar a serialização de ponta a ponta.

Datas civis (nascimento/despesa) continuam DATE. Defaults de data de despesa e
início usam UTC para não depender do timezone do host; a API atual exige ambas
na entrada, portanto esses defaults não substituem datas recebidas do usuário.

## Regras preservadas e limites

- Solicitante pode ser diferente do proprietário; cinco FKs, sem cascata.
- Campos/tamanhos, booleanos, IDs inteiros e constraints SQL originais preservados.
- CONCLUIDO sem data já é rejeitado pela API; o SQL Server original não contém
  essa CHECK. Não acrescentada silenciosamente na estrutura equivalente.
- Valores NUMERIC(10,2); NaN explicitamente rejeitado (SQL Server não o aceita).
  Os validadores da API continuam responsáveis por rejeitar casas monetárias
  excedentes ANTES do cast, que também arredonda em PostgreSQL.
- Views somam cancelados e custo zero sem despesas; não multiplicam receita por
  JOIN de despesas. Função SECURITY INVOKER consulta a View, sem repetir cálculo.
- Totais permanecem NUMERIC sem limite artificial de 10 dígitos. A futura saída
  JSON deve preservar strings decimais; COUNT retorna bigint, a adaptar com limites.
- VARCHAR UTF-8 conta caracteres, não os bytes da code page antiga. Não prometer
  preservação de perda de caracteres que já ocorria na persistência SQL Server.

## Permissões e implantação futura (não executada)

`dc_migrator`: proprietário do schema/objetos e executor de migrações, separado da
API. `dc_api`: apenas SELECT/INSERT/UPDATE em Cliente/Veículo/Serviço;
SELECT/INSERT/UPDATE/DELETE em Despesa; SELECT em Usuário/Tipo/Views; USAGE somente
nas sequências necessárias e EXECUTE somente nas três funções autorizadas.
Sem DDL, criação de usuários administrativos, DELETE de outros cadastros ou acesso
ao histórico de migrações. Nenhuma senha ou conta inicial é versionada/criada.

No futuro Supabase: revisar papéis pré-existentes antes de bootstrap; provisionar
logins separados por meio seguro, associar papéis adequados, manter app fora dos
schemas expostos e desabilitar Data API se não usada. Revisar grants preexistentes:
estas migrações pressupõem projeto/schema novos. Não usar postgres/service_role
como identidade normal da API. Não há mudança para Supabase Auth.

Render Free/Supabase Free continuam sujeitos a suspensão/limites. Sessões em
memória e backups/restauração não são resolvidos por estas migrações. Nenhuma
decisão de hospedagem autoriza dados pessoais reais ou publicação nesta etapa.

## Critérios e pendências

Integração verifica execução SQL real, seed idempotente, precisão, FK/UNIQUE/NOT
NULL/CHECK, permissões, seis tabelas, índices, função/Views e UTC. Testes não
provam equivalência universal de collation nem execução no Supabase.
Resolvido: política NFC/NFD autorizada e testada na Etapa 2.1. Pendente: executar
a suíte em PostgreSQL 17 e confirmar versão/ICU no projeto Supabase quando
autorizado; adaptar e testar serialização/validação no futuro
driver, incluindo rejeição explícita de entradas de sete casas. Não avançar
para a Etapa 3 sem autorização.

Fontes técnicas consultadas:
- https://www.postgresql.org/docs/17/collation.html
- https://www.postgresql.org/docs/current/datatype-datetime.html
- https://supabase.com/docs/guides/database/connecting-to-postgres

## Histórico da Etapa 2, antes da correção 2.1 — 27/10/2026

- PostgreSQL nativo 18.4, instalado no Windows: 15 testes de integração aprovados.
- Suíte do backend preservado: 88 testes aprovados; typecheck e build aprovados.
- Nenhum teste acessa o Supabase ou escreve no SQL Server; neste último foram
  executados somente SELECTs de metadados e comparações de parâmetros sintéticos.
- A matriz de compatibilidade aprovada nos testes é limitada aos casos listados.
  O teste de Unicode registra uma divergência conhecida, não prova equivalência.
- Projeções UTC foram verificadas em UTC, America/Fortaleza e Pacific/Auckland.
  Não houve teste HTTP com driver PostgreSQL: ele ainda não foi implementado.
- Nenhuma dependência foi instalada. Nenhum arquivo fora desta pasta foi alterado
  pela Etapa 2. Builds locais apenas regeneram artefatos ignorados existentes.

As primeiras rodadas detectaram erro nas regras ICU personalizadas; a versão final
usa a collation padrão secundária e uma chave de igualdade explícita. As regras
SQL Server originais permanecem intactas. A diferença Unicode então pendente foi
resolvida pela política da Etapa 2.1 abaixo; a versão do destino ainda requer teste.

## Resultado da Etapa 2.1 — 27/10/2026

- 19 testes reais aprovados no PostgreSQL 18.4, sem falhas ou testes ignorados.
- NFC/NFD: representação armazenada, consultas equivalentes, duplicidades de
  INSERT/UPDATE e concorrência; distinção de acentos, caixa/espaços de exibição,
  NULL, proteção do hash e limite de varchar validados.
- Valores financeiros, datas, UTC, relacionamentos, índices, grants e restrições
  continuam passando na mesma suíte.
- PostgreSQL 17: revisão de recursos na documentação oficial concluída, mas sem
  execução por ausência dos binários e Docker. Não afirmar aprovação em 17.
- Não foram alterados frontend, backend, SQL Server, credenciais ou migrações
  001–004. O cluster descartável foi encerrado e removido ao concluir.
- Etapa 2 pronta para encerramento no escopo local, com a limitação de versão
  documentada. Execução no PostgreSQL/ICU do destino permanece requisito antes de
  publicação. Etapa 3 apenas planejada em UNICODE.md, aguardando autorização.
