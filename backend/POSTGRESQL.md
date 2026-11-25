# PostgreSQL — Etapas 3.1 a 3.2D

Preparação de conexão gerenciada, condições de compatibilidade e roteiro de
homologação: [Supabase — Etapa 4.1](SUPABASE.md). Nenhuma conexão remota validada.

Implementação incremental: autenticação/consulta de Usuários e cadastro, consulta
e edição de Clientes, Veículos e Serviços, sem DELETE, consulta de Tipos de Serviço
e CRUD de Despesas, incluindo DELETE protegido por sessão/CSRF, além de Dashboard/Financeiro.
SQL Server continua padrão e mantém todos os módulos.
Nenhuma cópia de dados, provisionamento, migração automática ou conexão ao
Supabase é realizada pelo backend. Todos os módulos possuem persistência
PostgreSQL validada localmente; hospedagem e uso operacional exigem validação própria.

## Seleção e configuração

`DB_PROVIDER=sqlserver` (ou variável ausente) preserva `DB_*`, Tedious e os
repositórios existentes. `DB_PROVIDER=postgres` seleciona exclusivamente `pg` e
as variáveis `PG_*` abaixo. Valor desconhecido impede inicialização. Falha de
PostgreSQL nunca faz fallback para SQL Server. Trocar provedor exige reiniciar
o processo e autenticar novamente; não se compartilham sessões entre processos.

Não alteramos o `.env` real. Configure um ambiente separado de testes antes de
uma futura execução manual. Não use o banco SQL Server existente como origem.

| Variável | Finalidade / padrão |
| --- | --- |
| PG_HOST | Host exato, obrigatório, sem URL ou connection string |
| PG_PORT | Porta TCP, 5432 |
| PG_DATABASE | Banco PostgreSQL novo, obrigatório |
| PG_USER / PG_PASSWORD | Login de execução, obrigatório; nunca role migradora/admin |
| PG_SSL_MODE | `verify-full` por padrão; `disable` somente em loopback com APP_MODE=local |
| PG_SSL_CA_FILE | Opcional: arquivo de CA confiável; nunca desabilita verificação de certificado/hostname |
| PG_POOL_MAX | 10; ajustar futuramente ao limite do serviço/pooler |
| PG_CONNECTION_TIMEOUT_MS | 5000 |
| PG_IDLE_TIMEOUT_MS | 30000 |
| PG_STATEMENT_TIMEOUT_MS | 15000; timeout no servidor PostgreSQL |

O pool recebe configuração explícita (sem DATABASE_URL nem resolução implícita
das credenciais `PGHOST`/`PGUSER` do shell). TLS remoto exige certificado válido;
não usar `NODE_TLS_REJECT_UNAUTHORIZED=0`. APP_MODE, HOST, PORT, origens, cookies
Secure, proxy, CSRF e memória de sessões continuam conforme [HOSTING.md](HOSTING.md)
e [AUTH.md](AUTH.md). Local continua 127.0.0.1:3001/5173.

O pool é criado sob demanda. As requisições compartilham o mesmo pool; erros
propagam sem repetir escritas. Não há Promise rejeitada de inicialização
armazenada. O driver gerencia seus clientes e novas aquisições; não adicionamos
retentativas automáticas de operações. Encerramento é idempotente e impede
reutilização. `SQL_DIAGNOSTICS=true` também permite códigos PostgreSQL seguros
em desenvolvimento; produção desabilita diagnóstico detalhado. Nunca se
registram SQL, parâmetros, detail, mensagens brutas ou credenciais.

## Contratos preservados

### Dashboard/Financeiro — Etapa 3.2D

Os três GETs financeiros estão disponíveis com as mesmas interfaces existentes,
usando exclusivamente Views/função do PostgreSQL. Totais são calculados no banco,
decimais projetados como strings de duas casas e contagens como inteiros JSON.
Cancelados participam dos totais; não há fluxo de caixa por data de pagamento.
Veja [FINANCIAL-PARITY.md](FINANCIAL-PARITY.md) para os cenários, resultados,
limitações da comparação SQL Server/PostgreSQL e plano detalhado da Etapa 4.

### Despesas — Etapa 3.2C

A condição inicial foi cumprida antes da implementação: 19 testes SQL aprovados
no PostgreSQL 18.4 descartável, resolvendo a pendência da 3.2B. Migrações 001–005
continuam intactas. Financeiro/Dashboard e /api/servicos/:id/resumo-financeiro
retornavam 503 na 3.2C; foram liberados na 3.2D.

Operações liberadas: GET /api/despesas, GET /api/despesas/:id,
GET /api/servicos/:id/despesas, POST /api/despesas, PUT /api/despesas/:id e
DELETE /api/despesas/:id. Sem novos endpoints. Arrays são ordenados por
id_despesa. Serviço inexistente no filtro retorna 404 SERVICE_NOT_FOUND;
serviço existente sem despesas retorna []. POST retorna 201 com objeto e
Location; PUT retorna 200 e exige corpo completo; exclusão retorna 204 vazio,
e uma consulta ou segunda exclusão do mesmo ID retorna 404 EXPENSE_NOT_FOUND.

O schema app.despesa_servico recebe somente os campos existentes. descricao é
obrigatória (150), observacoes opcional (300), ambas NFC antes dos limites.
valor é estritamente positivo, até 99999999.99, no máximo duas casas de entrada,
enviado como string decimal e retornado com duas casas via ::text. Não há
cálculos de dinheiro em JavaScript ou arredondamento de entradas. data_despesa
é DATE, vinculada como YYYY-MM-DD e projetada explicitamente como texto, sem
conversão de fuso. Não se usa Date do JavaScript na persistência PostgreSQL.

Serviço existente é obrigatório; status concluído/cancelado não impede despesa.
PUT pode trocar o serviço. FK concorrente conhecida, CHECK de valor e NOT NULL
conhecido retornam 400 INTEGRITY_ERROR; ausência na pré-consulta retorna
400 INVALID_REFERENCE. PK conhecida retorna 409 DUPLICATE_EXPENSE; não se cria
unicidade de descrição. Outros erros permanecem 500 genéricos, sem detalhes SQL.
SELECT/INSERT/UPDATE/DELETE já estavam concedidos a dc_api nas migrações.

A confirmação de exclusão permanece na interface existente, sem alteração do
frontend ou novo parâmetro HTTP de confirmação. A API preserva exigência de
sessão e CSRF também em DELETE. Os testes de DELETE usam somente registros
sintéticos no cluster descartável; a regressão SQL Server usa banco simulado.

### Serviços e Tipos — Etapa 3.2B

GET /api/servicos (array por id_servico), GET /api/servicos/:id, POST (201 com
Location) e PUT (200 com objeto completo) usam app.servico. Sem filtros novos,
paginação ou DELETE. GET /api/tipos-servico retorna todos, inclusive inativos,
ordenados por id_tipo_servico, com nome, descricao nullable e ativo booleano.
Tipo inativo existente continua aceito como referência: não havia regra para
bloqueá-lo. O solicitante pode ser diferente do proprietário do veículo.

Status existentes: EM_ANDAMENTO, CONCLUIDO e CANCELADO. **ABERTO não existe no
contrato ou na constraint atual** e continua recebendo 400. Não há máquina de
transições: cancelar e voltar a andamento continuam possíveis. CONCLUIDO exige
data_conclusao válida; qualquer conclusão informada não pode anteceder início.
NFC aplica-se somente a status/observacoes antes das validações de comprimento.
As FKs e os grants existentes são reutilizados; nenhuma migração foi alterada.

Datas de início/conclusão continuam strings YYYY-MM-DDTHH:mm:ss com fração
opcional e sem fuso. O validador PostgreSQL rejeita explicitamente **toda entrada
com sete casas**, inclusive .1234560, conforme a política da Etapa 2. Não reduz
ou arredonda essa entrada. Reutiliza calendário, comparação e regras existentes,
mas envia a string original para app.parse_timestamp, não o preenchimento com
sete casas produzido pelo validador SQL Server. SQL Server mantém sete casas.

Na leitura, PostgreSQL projeta texto com até seis casas significativas, sem
Date do JavaScript, sem Z e sem converter início/conclusão de fuso. A fração zero
é omitida. .123456 permanece .123456 (não se inventa uma sétima casa). O formato
continua aceito pelo frontend; não se promete igualdade textual da quantidade
de zeros com SQL Server. data_cadastro é o novo instante UTC, convertido
explicitamente para texto **sem Z**, conforme o contrato de Serviços. A consulta
foi comparada com sessão PostgreSQL em Pacific/Auckland, sem alteração da saída.
Não houve cópia nem reinterpretacão de cadastros antigos do SQL Server.

Valores são validados pela rotina existente, enviados como strings para
numeric(10,2) e retornados com ::text: duas casas, sem cálculo em ponto flutuante.
São aceitos 0.00 até 99999999.99, inclusive em cancelados; excesso de casas é
rejeitado antes do cast. Custos/resultados não são armazenados ou calculados aqui.

400 INVALID_REFERENCE cobre referências ausentes na pré-consulta; FKs/CHECKs
conhecidas e NOT NULL geram 400 INTEGRITY_ERROR após a escrita. A PK conhecida
gera 409 DUPLICATE_SERVICE; falhas desconhecidas permanecem 500 genéricas.
404 SERVICE_NOT_FOUND preservado. Rotas de despesas e resumo financeiro sob
/api/servicos/:id ficaram bloqueadas durante a 3.2B; Despesas foi liberado na
3.2C e Financeiro na 3.2D, preservando autenticação e CSRF.

Validação desta etapa: 102 testes de backend (regressão SQL Server simulada) e
22 testes HTTP em PostgreSQL 18.4 real descartável aprovados. A execução separada
dos 19 testes SQL foi solicitada, mas recusada na autorização de execução; não
foi repetida nem considerada aprovada naquela etapa; a pendência foi resolvida
na verificação inicial da 3.2C. As migrações 001–005 foram
aplicadas no cluster da integração HTTP. PostgreSQL 17 continua não testado.

### Veículos — Etapa 3.2A

GET /api/veiculos e /api/veiculos/:id, POST /api/veiculos e PUT /api/veiculos/:id
usam app.veiculo com o login de runtime dc_api. Não há DELETE. Mantêm arrays,
objetos snake_case, IDs numéricos, Location no POST 201, PUT completo, ano null
quando omitido e data_cadastro ISO UTC com milissegundos. O proprietário deve
existir em app.cliente. Nenhum veículo ou cliente local foi copiado.

NFC é aplicado em placa, tipo_veiculo, marca, modelo e renavam antes dos limites.
As validações existentes continuam: placa antiga/Mercosul, RENAVAM com 11 dígitos
(incluindo zeros iniciais), tipo/marca/modelo obrigatórios e ano de quatro dígitos.
SQL Server não recebe a nova normalização: seu comportamento foi preservado.

A consulta de duplicidade usa text_key/COLLATE app.ci_as, igual aos índices
UNIQUE, excluindo o próprio ID no PUT. Os códigos HTTP 409 continuam
DUPLICATE_PLATE, DUPLICATE_RENAVAM e DUPLICATE_PLATE_AND_RENAVAM. Um 23505 das
constraints conhecidas após a pré-consulta provoca reconsulta; se o conflito
desaparecer ou a consulta falhar, mantém DUPLICATE_VEHICLE genérico seguro.
A FK fk_veiculo_cliente (23503) também mantém 400 OWNER_NOT_FOUND quando há
remoção concorrente do proprietário. Constraints desconhecidas e falhas de
permissão continuam internas, sem mensagens brutas. SQL Server conserva seu
tratamento anterior de 2601/2627/547. Não houve alteração nas migrações.

Os testes HTTP descartáveis usam repositórios e SQL reais, com barreira apenas
nas pré-consultas para provocar concorrência determinística em dois POSTs.
As constraints reais decidem o vencedor. Também verificam edição própria,
troca de proprietário, parâmetros, NFC/NFD, FKs, permissões, 401 e CSRF.

### Contratos comuns e Clientes

- Login/me/logout preservam bcrypt, senha byte-exata, sessão HttpOnly, CSRF,
  expiração e limite de tentativas. Não utilizam Supabase Auth.
- GET Clientes retorna array; detalhe objeto; POST 201 e Location; PUT 200
  substitui campos editáveis. IDs continuam números; opcionais continuam null.
- UNIQUE `uq_cliente_cpf_cnpj` (23505) retorna 409 DUPLICATE_DOCUMENT, inclusive
  concorrência. Validações continuam 400, ausência 404. Falhas de permissão,
  esquema, conexão ou constraints desconhecidas continuam 500 INTERNAL_ERROR
  nas rotas de negócio; health/db retorna 503 DATABASE_UNAVAILABLE.
- Todas as rotas existentes foram migradas na 3.2D. Não autenticados continuam
  recebendo 401. Nenhum SQL Server é consultado no provedor PostgreSQL.
- NFC antes da validação de comprimento nos cinco campos textuais de Cliente
  e no e-mail de login. Nome de usuário é normalizado pela trigger no cadastro
  administrativo; esta etapa não cria rota de cadastro de Usuários. Senhas,
  hashes, tokens, datas e propriedades desconhecidas não são normalizados.
- Busca de login usa `app.text_key` e `COLLATE app.ci_as`, como a unicidade.
  Mantém distinção de acentos, comparação sem distinção de caixa e tratamento
  de espaços da política [UNICODE.md](../database/postgresql/UNICODE.md).
- `data_nascimento` continua YYYY-MM-DD ou null, projetada como texto sem fuso.
  `data_cadastro` continua JSON ISO UTC com três casas, como o contrato Date
  existente. PostgreSQL armazena seis casas; pg/JavaScript Date representa
  milissegundos na resposta (ex.: .123456Z → .123Z), sem modificar o valor
  armazenado. Essa perda de resolução na **projeção pública** é explícita e
  testada. API não aceita data_cadastro como entrada. Timestamps de Serviços
  com sete casas continuam exclusivamente no caminho SQL Server; no PostgreSQL
  a rejeição explícita e o suporte até seis casas estão implementados na 3.2B.

## Banco e permissões

Aplicação exige migrações 001–005 já aplicadas por identidade administrativa
separada: [instruções SQL](../database/postgresql/README.md). Não aplica DDL ao
iniciar. Login de runtime deve herdar somente `dc_api`, nunca `dc_migrator`,
superuser ou proprietário do schema. Cliente recebe SELECT/INSERT/UPDATE e
USAGE da sequência; Usuario recebe somente SELECT. Esquema app permanece privado.

O utilitário `npm run user:prepare` existente gera **T-SQL para SQL Server**;
não executá-lo como procedimento PostgreSQL. Nenhum usuário real foi criado.
O bootstrap administrativo PostgreSQL definitivo continua uma etapa controlada:
coletar nome/e-mail/senha localmente, normalizar somente nome/e-mail antes dos
limites, gerar bcrypt com custo 12, inserir por parâmetros numa transação com
verificação de banco vazio, usando identidade administrativa separada; nunca
dar INSERT em Usuario ao login da API. Sem senha em SQL versionado ou terminal.

## Testes reproduzíveis (PowerShell)

Na raiz, com PostgreSQL 18 instalado e ICU disponível:

```powershell
cd backend
npm.cmd ci
npm.cmd test
npm.cmd run test:postgres
npm.cmd run typecheck
npm.cmd run build
cd ../database/postgresql
npm.cmd test
```

`test:postgres` cria uma instância nova em porta aleatória de loopback, aplica
bootstrap/migrações, cria credenciais aleatórias em memória, inicia HTTP local
com os repositórios reais e usa login membro de dc_api. Não lê .env, não aceita
URL externa e não acessa serviços existentes. Escritas são exclusivamente
sintéticas nesse cluster. Ao terminar fecha HTTP/pools e remove somente o
diretório marcado como pertencente ao teste. Nova execução recria tudo.
O harness compartilhado está em database/postgresql/tests/cluster.mjs.

No Windows, binário padrão: `C:/Program Files/PostgreSQL/18/bin`. Para outra
instalação use `$env:PG_TEST_BIN='caminho/bin'`. PostgreSQL 17 não foi executado
nesta máquina; não confundir compatibilidade esperada com validação realizada.

## Próximas etapas (não executadas; exigem autorização)

Etapa 4: integração controlada com Supabase. O plano com critérios de aprovação
está em [FINANCIAL-PARITY.md](FINANCIAL-PARITY.md). Não criar recursos, aplicar
migrações remotas, inserir conta inicial ou fazer deploy sem autorização.

TLS contra servidor remoto/Supabase, limites do pooler, conectividade Render,
sessões persistentes e disponibilidade continuam sem validação operacional.
