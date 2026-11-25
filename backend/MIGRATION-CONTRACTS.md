# Preparação PostgreSQL — Etapa 1

Registro do código atual em 26/10/2026. Não autoriza migração, mudança de contrato,
DDL ou conexão ao Supabase. A implementação SQL Server permanece integralmente.
Este documento distingue comportamento observado no código de comportamento que
exige integração com um banco real. Nenhum dado local foi consultado ou copiado.

## Limite da etapa

Somente documentação e testes de caracterização. Sem novo driver, seletor de
banco, migrações, alterações em src, frontend, autenticação ou configuração real.
As alterações de hospedagem já presentes no workspace não pertencem a esta etapa.

## HTTP e formatos comuns

Fonte: controllers, routes e middleware/error-handler.ts.

- GET de coleção: 200 e array direto, inclusive `[]`, sem envelope/paginação.
- GET por ID: 200 e objeto direto; inexistente: 404.
- POST de cadastro: 201, objeto criado e `Location: /api/<entidade>/<id>`.
- PUT: 200 e objeto completo. Não é PATCH: campos obrigatórios são exigidos;
  campos opcionais omitidos são normalizados para null, não preservados por merge.
- DELETE existe apenas para Despesas: 204 sem corpo.
- Erro: `{ "error": { "code": "...", "message": "..." } }`.
- JSON inválido/excessivo: 400 INVALID_BODY. Erro inesperado: 500 INTERNAL_ERROR,
  mensagem `Erro interno da API.`. Nunca retornar erro bruto do driver.
- IDs: números JSON inteiros positivos até 2147483647; parâmetros de URL são
  strings decimais positivas sem zeros iniciais. Não substituir IDs por UUID/string.
- Corpos de cadastros rejeitam campos desconhecidos, inclusive IDs/data_cadastro.
- Listagens dos repositórios atuais ordenam por ID crescente.

## Catálogo de entidades e campos

Os campos abaixo são os nomes reais snake_case. `?` indica opcional/nulo na entrada.
Campos de saída adicionais não são aceitos nos corpos de escrita.

| Rotas | Campos de entrada POST/PUT | Saída adicional |
| --- | --- | --- |
| /api/clientes, /api/clientes/:id | tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email?, data_nascimento? | id_cliente, data_cadastro |
| /api/veiculos, /api/veiculos/:id | id_cliente_proprietario, placa, tipo_veiculo, marca, modelo, ano?, renavam | id_veiculo, data_cadastro |
| /api/servicos, /api/servicos/:id | id_cliente, id_veiculo, id_tipo_servico, data_inicio, data_conclusao?, status, valor_recebido, observacoes? | id_servico, data_cadastro |
| /api/despesas, /api/despesas/:id | id_servico, descricao, valor, data_despesa, observacoes? | id_despesa |

`GET /api/servicos/:id/despesas` retorna array de despesas; serviço inexistente
gera 404, serviço sem despesas gera []. `GET /api/tipos-servico` retorna
id_tipo_servico (number), nome (string), descricao (string/null), ativo (boolean),
incluindo tipos inativos: não adicionar filtro implicitamente na migração.

Regras observadas nos validadores:

- Cliente: PF/PJ; CPF e CNPJ numérico ou alfanumérico conforme validação existente,
  normalizados e com dígitos verificadores; telefone obrigatório. Nome até 150,
  telefone 20, e-mail 150. E-mail de cliente não é normalizado para minúsculas.
- Veículo: proprietário existente; placa antiga/Mercosul, normalizada em maiúsculas
  sem hífen; RENAVAM string com 11 dígitos (preservar zeros iniciais).
  Tipo é texto obrigatório até 30, não enum fechado; marca 50, modelo 80.
  Ano é número inteiro entre 1000 e 9999 ou null.
- Serviço: três referências existentes verificadas separadamente. Solicitante
  não precisa ser proprietário. EM_ANDAMENTO, CONCLUIDO, CANCELADO; concluído exige
  conclusão, conclusão não pode anteceder início. Observações até 500.
- Despesa: descrição obrigatória até 150, observações até 300, valor estritamente
  positivo. Aceita serviço concluído/cancelado. Não há bloqueio financeiro por status.
- Textos passam por trim e rejeição de controles; opcionais vazios viram null.

## Datas: entrada, persistência e JSON não são a mesma camada

| Campo | Comportamento atual |
| --- | --- |
| Cliente.data_nascimento | YYYY-MM-DD ou null; SQL DATE projetado como texto |
| Despesa.data_despesa | YYYY-MM-DD obrigatório; SQL DATE projetado como texto |
| Serviço.data_inicio/conclusao | YYYY-MM-DDTHH:mm:ss com 0–7 casas, sem Z/offset; conclusão pode ser null |
| Serviço.data_cadastro | texto sem fuso, projeção CONVERT estilo 126 |
| Cliente/Veículo/Usuário.data_cadastro | Date no contrato interno; serializado para ISO UTC com Z pelo JSON |

O validador de Serviço completa a fração para sete casas. A resposta vem da
projeção SQL CONVERT(varchar(27), ..., 126), não diretamente do validador: não
prometer sete casas fixas em toda resposta. O frontend envia meia-noite sem fuso
para datas de serviço. A API ainda aceita horários e a sétima casa significativa.
SQL DATETIME2 não tem fuso; a interpretação de data_cadastro via driver deve ser
caracterizada em integração antes de se atribuir um fuso histórico.

PostgreSQL timestamp suporta até seis casas. Alternativas PENDENTES:

1. Preservação integral: timestamp com seis casas mais representação do dígito
   residual, com comparação/composição testadas. Maior complexidade; não adotado.
2. Limitar a seis casas mediante aprovação: rejeição explícita de precisão superior
   significativa ou regra de arredondamento documentada. Altera contrato; não adotado.
3. Restringir o domínio a DATE: combina com a interface, mas elimina horários hoje
   aceitos pela API. Exige aprovação separada; não é consequência automática da migração.

Nenhuma opção foi selecionada. Não truncar/arredondar silenciosamente. Não usar
Date JavaScript para timestamps de negócio sem fuso. Testar dia bissexto, fronteira
de dia, início/conclusão separados por 100 ns e execução em fusos distintos.

Referências: https://www.postgresql.org/docs/current/datatype-datetime.html e
https://node-postgres.com/features/types (consultadas na análise anterior).

## Valores monetários e financeiro

Entrada de serviço/despesa aceita number ou string decimal com ponto, até duas
casas; não aceita vírgula, negativos ou mais de 99999999.99. Serviço admite zero;
despesa não. O validador retorna string com duas casas. Os repositórios SQL Server
atuais convertem a entrada para Number para sql.Decimal(10,2); não alterados aqui.

Saídas monetárias são strings, incluindo totais grandes e resultados negativos.
Não converter totais para Number. A representação PostgreSQL futura deve manter
numeric exato e duas casas; não trocar o contrato para JSON number.

| Endpoint GET | Resposta |
| --- | --- |
| /api/dashboard/resumo | objeto: receita_total, custos_totais, resultado_liquido (strings); quantidade_servicos, servicos_em_andamento (numbers) |
| /api/financeiro/servicos | array: id_servico, cliente, placa, tipo_servico, status, data_inicio, data_conclusao, valor_recebido, custo_total, resultado_liquido |
| /api/servicos/:id/resumo-financeiro | objeto com os mesmos campos financeiros/identificação, SEM data_inicio/data_conclusao; inexistente 404 |

Views somam cancelados, mantêm custo zero sem despesas e não multiplicam receita
pelo número de despesas. Dashboard vazio retorna uma linha com totais/contagens
zero; ausência de linha da View é erro interno, não fallback para zeros.
Receita associada ao serviço não é fluxo de caixa por data de pagamento.
PostgreSQL COUNT retorna bigint: adaptar com verificação de faixa antes de devolver
number. SUM/numeric devem permanecer exatos; cálculos continuam no banco.

## Autenticação e erros

POST /api/auth/login exige JSON {email, senha} e
X-Requested-With: DespachanteControl. Sucesso 200: {usuario, csrfToken};
GET /api/auth/me usa a sessão e retorna o mesmo formato. Usuario contém
id_usuario, nome, email, ativo, data_cadastro, nunca senha_hash.
POST /api/auth/logout exige sessão e X-CSRF-Token; sucesso 204 sem corpo.
Cookie dc.sid HttpOnly, SameSite=Strict; Secure obrigatório no modo hosted.
CSRF permanece em memória no frontend. Não introduzir Supabase Auth nesta migração.

| HTTP | Códigos atuais relevantes |
| --- | --- |
| 400 | VALIDATION_ERROR, INVALID_BODY, INVALID_LOGIN_REQUEST, OWNER_NOT_FOUND, INVALID_REFERENCE, INTEGRITY_ERROR |
| 401 | INVALID_CREDENTIALS, UNAUTHENTICATED |
| 403 | ORIGIN_FORBIDDEN, CSRF_INVALID |
| 404 | CLIENT_NOT_FOUND, VEHICLE_NOT_FOUND, SERVICE_NOT_FOUND, EXPENSE_NOT_FOUND, NOT_FOUND |
| 409 | DUPLICATE_DOCUMENT, DUPLICATE_PLATE, DUPLICATE_RENAVAM, DUPLICATE_PLATE_AND_RENAVAM, DUPLICATE_VEHICLE, DUPLICATE_SERVICE, DUPLICATE_EXPENSE |
| 429 | LOGIN_RATE_LIMIT |
| 500 | INTERNAL_ERROR |
| 503 | DATABASE_UNAVAILABLE (health/db) |

GET /api/health é público: {status:"ok",service:"despachante-control-api"}.
GET /api/health/db é público: {status:"ok",database:"connected"}, ou 503.
Uma falha SQL em rota de negócio não é convertida automaticamente para 503.

Futuramente classificar SQLSTATE 23505 (unique), 23503 (FK), 23514 (check),
23502 (not null) sem mudar códigos HTTP públicos. Preservar fallback seguro de
duplicidade e exclusão do próprio veículo na edição. Não expor detail do PostgreSQL.

## Collation: alternativas sem decisão implícita

Os scripts SQL Server não fixam collation. Não foi consultado o banco real nesta
etapa: case/accent sensitivity e comparação de espaços finais NÃO estão confirmadas.
Login e preparação de usuário normalizam e-mail com trim/toLowerCase; consultas
SQL atuais usam igualdade. Não assumir equivalência entre collations dos bancos.

Alternativas a aprovar após caracterização somente de leitura autorizada:

- Normalização por domínio + índice UNIQUE sobre lower(email): simples para login,
  mas não reproduz automaticamente equivalência de acentos/espaços do SQL Server.
- Collation ICU específica: pode aproximar o comportamento, mas exige confirmar
  disponibilidade/versão e testar igualdade, unicidade e ordenação.
- Comparação PostgreSQL padrão: simples, mas pode mudar unicidade de nomes/e-mails.

Matriz futura: A/a, José/Jose, Unicode composto/decomposto, espaços finais,
documentos alfanuméricos e nomes de tipos. Não impor normalização genérica a nomes
ou outros campos. Varchar também tem diferenças de contagem bytes/caracteres;
testar limites com acentos e caracteres fora do BMP.

## Estratégia mínima e critérios para a próxima etapa

Reaproveitar interfaces dos seis repositórios e controles HTTP existentes.
Preservar SQL Server; futuro adaptador PostgreSQL separado. Nada de ORM obrigatório,
gravação dupla, fallback entre bancos ou reformulação dos formulários.

Testes de Etapa 1: migration-contract.test.ts usa validadores atuais e Express
real com repositórios simulados. Não importa server.ts, dotenv ou pool real.
Caracteriza precisão de 100 ns, moeda, PUT completo e formatos HTTP. Os testes
existentes cobrem demais entidades, autenticação e erros do driver SQL Server.

Executar: `npm.cmd --prefix backend test`, `npm.cmd --prefix backend run typecheck`.
Teste isolado, dentro de backend: `node --import tsx --test tests/migration-contract.test.ts`.

Futuro (não executado/aprovado): mesma matriz de contratos contra adaptadores reais
em bancos descartáveis, com fixtures sintéticas, incluindo concorrência de UNIQUE,
FK após verificação, 150.01 - 10.02 = 139.99, múltiplas despesas/cancelados, nenhum
registro e totais grandes. Mocks não provam execução SQL nem serialização do driver.

Decisões pendentes: precisão temporal; semântica de collation; política de fuso
para data_cadastro. Depois dessas decisões, autorizar separadamente migrações e
adaptador. Sessões persistentes são assunto operacional separado: não incluídas
nesta preparação. Nenhum usuário, banco, recurso Supabase ou migração foi criado.
