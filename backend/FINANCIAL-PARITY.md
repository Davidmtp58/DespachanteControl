# Financeiro PostgreSQL — Etapa 3.2D

## Contrato observado

Fontes: repositório/serviço/rotas financeiros, database/04_views.sql,
database/06_procedures.sql, migração PostgreSQL 002, grants 004 e
frontend/src/services/dashboard.ts. Não houve alteração desses objetos SQL,
dos cálculos, do frontend, nem do repositório SQL Server.

| Endpoint GET | Resultado |
| --- | --- |
| /api/dashboard/resumo | Objeto: receita_total, custos_totais, resultado_liquido (strings decimais), quantidade_servicos e servicos_em_andamento (números inteiros) |
| /api/financeiro/servicos | Array por id_servico crescente: id_servico, cliente, placa, tipo_servico, status, data_inicio, data_conclusao, valor_recebido, custo_total, resultado_liquido |
| /api/servicos/:id/resumo-financeiro | Objeto financeiro do serviço, sem campos de datas; 404 SERVICE_NOT_FOUND quando ausente |

Sem filtros de data/status ou paginação. GETs exigem sessão e retornam no-store.
IDs inválidos: 400; erros internos/permissões: 500 genérico. Não foram criadas
rotas de escrita financeira. POST/PUT/DELETE com sessão e CSRF válidos retornam
404; a proteção CSRF continua atuando antes de chegar às rotas.

Receita é SUM do valor_recebido registrado em Servico. Custos são SUM das
despesas. A View por serviço agrupa antes da consolidação, evitando multiplicar
receita por quantidade de despesas. Resultado é a diferença calculada no banco.
Todos os status participam: não se exclui CANCELADO. Serviços sem despesas
recebem custo zero. Total de serviços inclui concluídos/cancelados; o indicador
de andamento conta apenas EM_ANDAMENTO. O frontend conta os demais status a
partir da lista real. Não há nova coluna ou indicador para isso na API.
Não é fluxo de caixa por data de pagamento, nem apuração contábil.

## Representação e diferenças

O adaptador consulta app.vw_dashboard_resumo, app.vw_resumo_financeiro_servico e
app.resumo_financeiro_servico($1::integer). Nenhuma soma/subtração monetária é
feita em JavaScript. A projeção numeric(38,2)::text preserva a largura do contrato
SQL Server decimal(38,2), incluindo duas casas e resultados negativos. O limite
de cada lançamento continua numeric(10,2), independente do tamanho do agregado.

COUNT retorna bigint no PostgreSQL (string pelo pg). A projeção ::integer
preserva o number JSON e o limite int32 do COUNT SQL Server/validador React.
Um valor além do limite falha, sem conversão imprecisa ou saturação silenciosa.

Datas são projetadas como texto ISO local sem Z. Preservam até seis casas
significativas, sem Date do JavaScript; fração zero é omitida. SQL Server admite
até sete casas. Não se promete a mesma quantidade textual de zeros da saída
CONVERT(126), nem precisão de 100 ns no PostgreSQL. Essa diferença temporal já
foi aprovada/documentada nas etapas anteriores; o consumidor React aceita a
fração variável. Testes com timezone Pacific/Auckland confirmam saída estável.

## Cenários sintéticos e resultados esperados

Fixtures comuns: tests/financial-fixtures.ts. Teste SQL Server simulado:
tests/postgres-financeiro.test.ts. PostgreSQL real: tests/integration/financeiro.test.ts.

| Serviço | Receita | Despesas | Custo | Resultado |
| --- | --- | --- | --- | --- |
| EM_ANDAMENTO | 150.01 | 10.02 e 0.03 | 10.05 | 139.96 |
| CONCLUIDO | 0.00 | 1.01 | 1.01 | -1.01 |
| CANCELADO | 20.02 | 2.02 | 2.02 | 18.00 |
| EM_ANDAMENTO sem despesas | 0.00 | nenhuma | 0.00 | 0.00 |
| Total | 170.03 | | 13.08 | 156.95 |

Total: quatro serviços, dois em andamento. Banco vazio: todas as quantias
"0.00", contagens 0, lista []. Os testes seguintes alteram dados somente no
cluster descartável e verificam resultados fixos, sem somas em ponto flutuante:

| Alteração | Receita | Custo | Resultado |
| --- | --- | --- | --- |
| Despesa 10.02 passa a 20.03 | 170.03 | 23.09 | 146.94 |
| Excluir despesa 0.03 | 170.03 | 23.06 | 146.97 |
| Serviço cancelado passa a andamento, receita 30.03 | 180.04 | 23.06 | 156.98 |
| Cadastrar despesa 0.02 no serviço sem despesas | 180.04 | 23.08 | 156.96 |
| Novo serviço 99999999.99 e duas despesas 99999999.99 | 100000180.03 | 200000023.06 | -99999843.03 |

O último serviço isolado tem custo 199999999.98 e resultado -99999999.99.
Também há teste simulado de representação acima de Number.MAX_SAFE_INTEGER;
não é um teste real de agregação de milhões de lançamentos.

## Evidência e limites da comparação

PostgreSQL 18.4 real: migrações aplicadas em cluster novo; Views e função
consultadas diretamente; HTTP com conta membro de dc_api; CRUD sintético por
HTTP; grants e falhas de permissão; formatos, datas, centavos, ausência e status.

SQL Server: inspeção dos scripts originais, regressão dos repositórios e HTTP
com banco simulado e as mesmas fixtures/expectativas. Não foi localizado Docker
ou LocalDB utilizável para criar SQL Server descartável nesta máquina. sqlcmd é
somente cliente; sua presença não fornece uma instância descartável. Não se
criou banco temporário na instância SQL Server original, nem se acessaram seus
dados. Portanto **não houve execução comparativa real dos dois motores** e
não se declara equivalência integral de comportamento/aritmética dos motores.
Uma comparação real futura deve executar essas mesmas fixtures em SQL Server
isolado e incluir metadados de precisão/escala das expressões e totais extremos.

Validação desta etapa: 107 testes backend (SQL Server simulado), 35 testes HTTP
PostgreSQL reais e 19 testes SQL reais. TypeScript/build/diff verificados na
entrega. Nenhum teste escreve ou exclui dados de banco permanente.

## Prontidão e pendências

A persistência PostgreSQL cobre agora todas as APIs existentes no escopo local.
DB_PROVIDER=sqlserver permanece padrão; postgres seleciona apenas repositórios
PostgreSQL. Não há fallback nem bloqueio MODULE_NOT_MIGRATED restante.

Isso permite avançar para validação remota, não declara prontidão operacional.
Continuam pendentes: versão PostgreSQL do destino (17 não executado localmente),
TLS/CA e rede remotos, limites do pool/pooler, carga e planos de execução das
Views em volumes representativos, disponibilidade, backup e restauração real.
As sessões em memória perdem continuidade ao reiniciar/suspender a API. O
bootstrap de primeira conta existente ainda gera T-SQL; é necessário preparar
procedimento PostgreSQL administrativo seguro antes de abrir um piloto.

## Etapa 4 — proposta, sem execução

1. **Confirmar destino e isolamento.** Com autorização, escolher projeto novo
   Supabase de testes, região, versão, limites/custos atuais e estratégia de
   backup. Sem copiar SQL Server. Critério: banco vazio e identificação inequívoca
   de teste; proibir execução dos harnesses descartáveis contra esse destino.
2. **Validar migrações e privilégios gerenciados.** Conferir ICU, collation,
   normalize, Views security_invoker e permissões para criar/atribuir roles.
   Executar testes na versão do destino. Se o bootstrap exigir adaptação ao
   serviço gerenciado, apresentar a necessidade e manter migrações versionadas,
   sem alterar checksums já aplicados silenciosamente.
3. **Aplicar estrutura revisada.** Usar identidade migradora separada, ledger e
   transações; manter schema app privado, seis tabelas, Views/função e somente
   tipos iniciais idempotentes. Critério: execução/reexecução controladas e
   nenhuma conta humana/dado de cliente inserido automaticamente.
4. **Configurar login da API.** Login próprio herda somente dc_api, sem ownership,
   superuser, DDL ou escrita de Usuario. Manter app fora dos schemas expostos
   pela Data API; revisar grants PUBLIC e acessos externos. Validar permissões
   positivas/negativas antes de usar qualquer informação pessoal.
5. **Validar conexão Express.** Selecionar endpoint direto ou pooler considerando
   rede/IP e limites reais do plano. Usar PG_* separados, verify-full, CA
   confiável quando necessária e secrets fora do Git/React. Testar TLS inválido,
   indisponibilidade, retomada de novas conexões e dimensionamento do pool, sem
   retries automáticos de escritas. Preservar configuração local original.
6. **Preparar primeira conta.** Procedimento administrativo explícito com senha
   obtida de forma segura, bcrypt, NFC somente em nome/e-mail e INSERT
   parametrizado/transacional. Não dar cadastro público nem permissão de escrita
   de Usuario à API. Testar login/me/logout, inativo, cookies e CSRF.
7. **Homologar dados sintéticos e restauração.** Executar cenários de negócio e
   financeiro em área de testes autorizada, medir consultas/pool, validar backup
   e restauração em destino separado. Sem executar automaticamente DELETE de
   testes ou limpeza em ambientes permanentes. Decidir sessões persistentes
   antes de uso operacional confiável.
8. **Decidir piloto Render separadamente.** Somente após os critérios anteriores,
   revisar HTTPS/origem exata/proxy/cookies, segredos e início a frio; autorizar
   deploy em etapa própria. Manter dados fictícios até concluir segurança,
   estabilidade, recuperação e validação manual de todos os módulos.

Nenhum recurso, usuário real, conexão Supabase ou deploy foi realizado nesta etapa.
