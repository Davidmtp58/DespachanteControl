# Backend — Despachante Control

API REST com Node.js, TypeScript, Express 5 e `mssql` (driver Tedious). Inclui Clientes, Veículos, Serviços, Despesas, consultas financeiras e autenticação por sessão. DELETE existe somente para despesas. O frontend React está integrado às APIs reais. Não implementa migrations.

**Autenticação obrigatória:** antes de iniciar, configure `SESSION_SECRET`. Consulte [AUTH.md](AUTH.md) para permissões mínimas, primeira conta e login seguro no PowerShell. As consultas de negócio abaixo exigem uma `$sessao` autenticada; execute-as dentro do exemplo de AUTH.md antes do logout, capturando respostas em variáveis. Gravações também exigem CSRF. Os health checks continuam públicos. O frontend utiliza autenticação real e as APIs de negócio.

## Instalação

Requer Node.js 22 ou superior (recomendado Node.js 24 LTS), npm e, para a verificação real do banco, uma instância SQL Server acessível por TCP/IP com o banco `DespachanteControl` já existente.

Execute a partir da raiz do repositório:

```powershell
cd backend
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Preencha `backend/.env` localmente. Nunca adicione credenciais ao código ou ao `.env.example`. Os arquivos `.env`, `.env.*`, dependências, logs e saída de build estão ignorados; `.env.example` é a exceção versionável. No PowerShell, se `npm.ps1` for bloqueado pela política de execução, use `npm.cmd` nos comandos, sem alterar a política do Windows.

## Configuração

| Variável | Padrão/comportamento |
| --- | --- |
| `HOST` | `127.0.0.1`; aceita somente `127.0.0.1`, `::1` ou `localhost`, inclusive nesta etapa de autenticação |
| `PORT` | `3001` |
| `DB_SERVER` | Obrigatória; hostname/IP ou `localhost\SQLEXPRESS` |
| `DB_INSTANCE` | Nome da instância; exemplo: `SQLEXPRESS` |
| `DB_PORT` | Alternativa à instância: porta TCP real, sem padrão implícito |
| `DB_DATABASE` | `DespachanteControl` |
| `DB_USER` / `DB_PASSWORD` | Obrigatórias para consultar o banco; autenticação SQL Server |
| `DB_ENCRYPT` | `true` |
| `DB_TRUST_SERVER_CERTIFICATE` | `false` |
| `DB_CONNECTION_TIMEOUT_MS` | `5000`, conexão e espera por conexão no pool |
| `DB_REQUEST_TIMEOUT_MS` | `5000`, limite da consulta |
| `DB_POOL_MAX` | `10`, mínimo fixo em zero |
| `DB_POOL_IDLE_TIMEOUT_MS` | `30000` |

Booleanos aceitam apenas `true` ou `false`; portas aceitam inteiros de 1 a 65535; limites e tamanho do pool precisam ser inteiros positivos. Variáveis já definidas no processo têm precedência sobre `.env`. Reinicie a API após mudanças no ambiente.

Use um login SQL Server autorizado a conectar ao banco existente. Esta configuração mantém `mssql` com Tedious e não utiliza autenticação integrada do Windows nem ODBC. Não é necessário executar ou alterar os scripts SQL para iniciar a API.

### SQL Server Express local

Edite somente o `.env` local com:

```dotenv
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_DATABASE=DespachanteControl
DB_USER=despachante_app
DB_PASSWORD=
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
```

Preencha `DB_PASSWORD` exclusivamente no editor local com a senha do login SQL Server; não a envie no chat nem a coloque em comandos do terminal. O exemplo deixa a senha vazia intencionalmente: o banco retornará indisponível até ela ser preenchida. Nenhum usuário ou senha é fixado no código. As demais variáveis estão no `.env.example`.

Remova/comente qualquer `DB_PORT=1433` herdado do exemplo anterior, inclusive em variáveis do processo. Instância e porta explícita são mutuamente exclusivas. Também é aceito `DB_SERVER=localhost\SQLEXPRESS` sem `DB_INSTANCE`; se ambos informarem a instância, os nomes devem coincidir. No `.env`, a barra invertida é escrita uma única vez.

A descoberta da porta exige SQL Server Browser disponível e UDP 1434 acessível. A instância deve aceitar conexões TCP/IP. Se preferir conexão direta sem Browser, remova `DB_INSTANCE`, use `DB_SERVER=localhost` e configure `DB_PORT` com a porta TCP efetiva da instância; não presuma que seja 1433. [Configuração do Tedious](https://tediousjs.github.io/tedious/api-connection.html).

Para autenticação SQL Server, confira localmente se a instância permite esse modo e se o login `despachante_app` está habilitado e autorizado no banco `DespachanteControl`. Esta implementação não altera serviços, protocolos, logins, permissões ou configurações do SQL Server.

Após preencher o ambiente, execute `npm.cmd run dev` em `backend/` e consulte `/api/health/db` pelos comandos abaixo. HTTP 200 com `database: connected` confirma a consulta real. Em caso de 503, confira senha, acesso ao banco, TCP/IP, Browser/porta e certificado. Nenhuma mensagem de erro HTTP expõe a senha.

Mantenha a criptografia habilitada. Somente no desenvolvimento local com certificado autoassinado, `DB_TRUST_SERVER_CERTIFICATE=true` permite confiar nesse certificado; fora desse cenário, use certificado válido e mantenha `false`. Senhas com `#` devem ficar entre aspas no `.env`.

## Execução

Todos os comandos abaixo são executados dentro de `backend/`, onde o dotenv busca `.env`:

```powershell
npm run dev
# Ou compile e execute o JavaScript:
npm run build
npm start
```

`dev` acompanha alterações com tsx. `build` gera `dist/`. `start` requer o build anterior. Ctrl+C encerra o servidor e o pool; há um prazo de encerramento de 15 segundos.

## Endpoints

```powershell
curl.exe -i http://127.0.0.1:3001/api/health
curl.exe -i http://127.0.0.1:3001/api/health/db
```

- `GET /api/health`: HTTP 200, `{"status":"ok","service":"despachante-control-api"}`. Não consulta o SQL Server.
- `GET /api/health/db`: abre/reutiliza o pool e executa somente `SELECT 1 AS ok` no banco configurado. HTTP 200, `{"status":"ok","database":"connected"}`, somente após a consulta concluir.
- Banco sem configuração, inacessível, login recusado ou consulta com falha: HTTP 503 com `{"error":{"code":"DATABASE_UNAVAILABLE","message":"Banco de dados indisponível ou não configurado."}}`.
- Rota inexistente: HTTP 404 com código `NOT_FOUND`. Erro inesperado: HTTP 500 com código `INTERNAL_ERROR`.

Respostas de erro não expõem credenciais, host, mensagem do driver ou stack trace. Os health checks desabilitam cache. A API inicia sem SQL Server; as variáveis de banco são validadas ao chamar `/api/health/db`. Falhas de conexão liberam o pool incompleto e permitem nova tentativa. O pool já conectado gerencia suas conexões pelo driver.

Um HTTP 200 em `/api/health` não valida o banco. Um HTTP 200 em `/api/health/db` valida conexão e consulta simples, não a estrutura das tabelas, views, procedures ou permissões de todas as operações de negócio.

## Validação automatizada

```powershell
npm run typecheck
npm test
npm run build
```

Os testes usam HTTP local e pools/executores simulados: cobrem saúde, configuração, pool, vinculação de parâmetros, rotas de clientes, validação de documentos/campos, códigos HTTP e ausência de vazamento nas respostas. Não estabelecem conexão real com SQL Server e não leem nem modificam dados existentes. Nunca execute testes de escrita no banco real sem autorização explícita.

## API de clientes

| Método e caminho | Sucesso | Resultado |
| --- | --- | --- |
| `GET /api/clientes` | 200 | Array de clientes, ordenado por `id_cliente`; vazio retorna `[]` |
| `GET /api/clientes/:id` | 200 | Um cliente |
| `POST /api/clientes` | 201 | Cliente criado e cabeçalho `Location` |
| `PUT /api/clientes/:id` | 200 | Cliente atualizado |

Os nomes dos campos seguem a tabela SQL. O corpo de POST/PUT deve ser um objeto JSON com `Content-Type: application/json` (limite de 16 KB):

| Campo | Regra |
| --- | --- |
| `tipo_pessoa` | Obrigatório, `PF` ou `PJ` |
| `nome_razao_social` | Obrigatório, texto não vazio, até 150 caracteres |
| `cpf_cnpj` | Obrigatório, string; CPF para PF ou CNPJ para PJ; formato e dígitos verificadores válidos |
| `telefone` | Obrigatório, texto não vazio, até 20 caracteres |
| `email` | Opcional, nulo ou e-mail válido de até 150 caracteres |
| `data_nascimento` | Opcional, nulo ou data de calendário válida no formato `YYYY-MM-DD` |

PUT substitui os campos editáveis: os obrigatórios precisam ser reenviados e opcionais omitidos/vazios tornam-se `NULL`. Não é PATCH. Campos desconhecidos, incluindo `id_cliente` e `data_cadastro`, são rejeitados. O banco gera ID e data de cadastro; a atualização preserva ambos. Não há campos derivados adicionais. `data_nascimento` é devolvida como `YYYY-MM-DD` ou `null`.

CPF/CNPJ são aceitos sem máscara ou com máscara padrão e armazenados sem pontuação. CNPJ aceita também o formato alfanumérico, convertido para maiúsculas, mantendo as 14 posições da coluna existente. A verificação de dígitos não comprova existência ou situação cadastral na Receita. Referência: [cálculo de DV do CNPJ — Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj).

A restrição UNIQUE existente é a garantia de unicidade, inclusive entre gravações concorrentes: erros SQL 2601/2627 são convertidos em HTTP 409. Valores fornecidos pelo cliente são enviados por parâmetros tipados (`Int`, `VarChar` com os tamanhos da tabela e `Date`); não são concatenados ao SQL. Nenhum registro antigo é normalizado ou atualizado automaticamente.

Erros seguem `{ "error": { "code": "...", "message": "..." } }`: 400 para ID/corpo/campos inválidos, 404 para cliente inexistente, 409 para CPF/CNPJ duplicado e 500 genérico para falhas inesperadas. DELETE não tem rota e retorna 404. Respostas não incluem SQL, detalhes do driver ou credenciais.

### Validação somente de leitura no banco real

A conexão real do health check foi confirmada pelo usuário. Para validar as novas consultas, inicie a API em `backend/` com `npm.cmd run dev` e, em outro terminal, execute:

```powershell
curl.exe -i http://127.0.0.1:3001/api/health/db
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/clientes' -Method GET -WebSession $sessao -UseBasicParsing
# Substitua 1 por um id_cliente retornado pela listagem:
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/clientes/1' -Method GET -WebSession $sessao -UseBasicParsing
```

Se não houver clientes, a lista deve ser vazia; não é preciso cadastrar registros para testar a leitura. O login SQL precisa ter permissão SELECT na tabela. Futuras chamadas autorizadas de POST/PUT precisarão das permissões correspondentes de INSERT/UPDATE e SELECT para OUTPUT. A API não concede permissões. Não envie POST/PUT ao banco real nesta validação: essas operações gravam dados.

## API de veículos

| Método e caminho | Sucesso | Resultado |
| --- | --- | --- |
| `GET /api/veiculos` | 200 | Array ordenado por `id_veiculo`, ou `[]` |
| `GET /api/veiculos/:id` | 200 | Veículo encontrado |
| `POST /api/veiculos` | 201 | Veículo criado e `Location: /api/veiculos/<id>` |
| `PUT /api/veiculos/:id` | 200 | Veículo atualizado |

POST/PUT recebem JSON (até 16 KB), com os campos da tabela:

| Campo | Contrato |
| --- | --- |
| `id_cliente_proprietario` | Número inteiro positivo até 2147483647; deve existir em `dbo.Cliente` |
| `placa` | Placa antiga `ABC1234`/`ABC-1234` ou Mercosul `ABC1D23`; aceita minúsculas e grava maiúsculas sem hífen |
| `tipo_veiculo` | Texto obrigatório não vazio de até 30 caracteres, conforme a coluna e o frontend existentes; sem enum fechado |
| `marca` | Texto obrigatório não vazio, até 50 caracteres |
| `modelo` | Texto obrigatório não vazio, até 80 caracteres |
| `ano` | Opcional: número inteiro de quatro dígitos (1000 a 9999), ou `null`; omitido resulta em `NULL` |
| `renavam` | String obrigatória de exatamente 11 dígitos, preservando zeros iniciais |

O contrato de RENAVAM valida formato e tamanho, sem consulta cadastral ou validação de dígito verificador adicional. O intervalo de ano é uma regra da API, compatível com SMALLINT; não é alterado o esquema SQL. Tipo de veículo não possui catálogo fechado no banco ou frontend: são aceitos, por exemplo, `Automóvel`, `Motocicleta` e `Caminhão`.

PUT substitui todos os campos editáveis e permite trocar o proprietário por outro cliente existente; ano omitido se torna nulo. ID/data de cadastro são gerados pelo banco e preservados na atualização. Campos desconhecidos ou gerados são rejeitados. Não há DELETE nem armazenamento de dados duplicados do proprietário.

O serviço verifica a existência do proprietário antes de escrever; a FOREIGN KEY continua protegendo a integridade, inclusive se o proprietário for removido entre a consulta e a escrita. Erros retornam 400 para campos/IDs inválidos ou proprietário inexistente, 404 para veículo inexistente, 409 para placa ou RENAVAM duplicado (UNIQUE 2601/2627) e 500 genérico para falhas inesperadas. Todas as entradas são vinculadas como parâmetros SQL tipados, nunca concatenadas às consultas. A proteção de HOST local continua ativa.

### Consultas no SQL Server real

Inicie com `npm.cmd run dev` em `backend/` e execute em outro PowerShell:

```powershell
curl.exe -i http://127.0.0.1:3001/api/health/db
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/veiculos' -Method GET -WebSession $sessao -UseBasicParsing
# Troque 1 por um id_veiculo retornado na lista:
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/veiculos/1' -Method GET -WebSession $sessao -UseBasicParsing
```

Lista vazia é válida (200 com `[]`); veículo inexistente retorna 404. Estas chamadas são somente de leitura. POST/PUT gravam no banco real e não devem ser usados nesta validação sem autorização específica. Os testes de veículos executam as quatro operações exclusivamente contra executores simulados, cobrindo parâmetros, proprietário inexistente, FK concorrente, duplicidades, formatos e respostas de erro. Nenhuma escrita real foi executada na implementação desta etapa.

## API de serviços

| Método e caminho | Sucesso | Resultado |
| --- | --- | --- |
| `GET /api/servicos` | 200 | Array ordenado por `id_servico`, incluindo cancelados |
| `GET /api/servicos/:id` | 200 | Serviço encontrado |
| `POST /api/servicos` | 201 | Serviço criado e `Location: /api/servicos/<id>` |
| `PUT /api/servicos/:id` | 200 | Serviço atualizado |
| `GET /api/tipos-servico` | 200 | Tipos cadastrados, incluindo inativos e o campo `ativo` |

POST/PUT recebem um objeto JSON (até 16 KB):

| Campo | Contrato |
| --- | --- |
| `id_cliente`, `id_veiculo`, `id_tipo_servico` | Obrigatórios, inteiros positivos até 2147483647; registros devem existir |
| `data_inicio` | Obrigatória na API, data/hora sem fuso: `YYYY-MM-DDTHH:mm:ss`, fração opcional de até 7 casas |
| `data_conclusao` | Opcional/nula, mesmo formato; não pode anteceder `data_inicio` |
| `status` | Obrigatório: `EM_ANDAMENTO`, `CONCLUIDO` ou `CANCELADO` |
| `valor_recebido` | Obrigatório: de 0 a 99999999.99, até duas casas; aceita número JSON ou string decimal com ponto |
| `observacoes` | Opcional/nula, texto de até 500 caracteres |

Prefira enviar valores financeiros como string (ex.: `"150.00"`). Entradas com mais de duas casas são rejeitadas, não arredondadas. O parâmetro SQL é `Decimal(10,2)`, compatível com a coluna, e as respostas apresentam `valor_recebido` como string com duas casas. Não são realizados cálculos financeiros em ponto flutuante na API.

As datas representam o horário civil já usado pelo banco: DATETIME2 não guarda fuso. Não envie `Z` ou offset. A API valida calendário e ordem cronológica, preserva até sete casas fracionárias e envia texto parametrizado convertido explicitamente para `datetime2(7)` no SQL, evitando perda por Date do JavaScript. As respostas também usam strings sem fuso. Embora a tabela tenha defaults para início/status, esta API exige ambos explicitamente em POST/PUT. PUT substitui os campos editáveis; conclusão e observações omitidas se tornam nulas. ID e data de cadastro continuam gerados/preservados pelo banco.

O cliente solicitante pode ser diferente do proprietário do veículo. São verificados apenas os relacionamentos existentes, sem criar restrição adicional de propriedade. Tipos inativos permanecem consultáveis e podem ser referenciados, conforme as restrições atuais do modelo. Não se exige conclusão para status CONCLUIDO além das regras declaradas no SQL. Cancelados permanecem registrados e listados; nenhuma View ou regra dos indicadores foi alterada. Custo total e resultado líquido não são aceitos no corpo nem persistidos na tabela.

Respostas de erro: 400 para campos, datas, valores, IDs ou referências inválidas e violações de integridade; 404 para serviço ausente; 409 para conflito de unicidade; 500 genérico para falha inesperada. A tabela não possui chave UNIQUE de negócio além da PK: dois serviços com os mesmos campos podem existir. O tratamento 409 não inventa uma regra de duplicidade. FOREIGN KEY/CHECK/NOT NULL continuam protegendo o banco, inclusive diante de alterações concorrentes após as consultas. DELETE não está implementado.

### Validar consultas reais de serviços

Em `backend/`, inicie `npm.cmd run dev`. Usando a porta local 3001 informada para este ambiente, execute em outro terminal:

```powershell
curl.exe -i http://127.0.0.1:3001/api/health/db
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/tipos-servico' -Method GET -WebSession $sessao -UseBasicParsing
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/servicos' -Method GET -WebSession $sessao -UseBasicParsing
# Substitua 1 por um id_servico retornado pela lista:
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/servicos/1' -Method GET -WebSession $sessao -UseBasicParsing
```

Use a porta exibida pelo servidor se sua configuração for diferente. Lista vazia retorna 200 com `[]`; ID inexistente retorna 404. POST/PUT foram testados exclusivamente com banco simulado nesta etapa. Nenhuma escrita real foi executada; não envie POST/PUT ao SQL Server real sem autorização específica. A suíte também cobre valores limites, status, datas fracionárias, solicitante diferente do proprietário, referências ausentes, integridade concorrente e preservação dos parâmetros SQL.

## API de despesas de serviço

| Método e caminho | Sucesso | Resultado |
| --- | --- | --- |
| `GET /api/despesas` | 200 | Array ordenado por `id_despesa`, ou `[]` |
| `GET /api/despesas/:id` | 200 | Despesa encontrada |
| `GET /api/servicos/:id/despesas` | 200 | Despesas do serviço, ou `[]` se o serviço existe sem despesas |
| `POST /api/despesas` | 201 | Despesa criada e `Location: /api/despesas/<id>` |
| `PUT /api/despesas/:id` | 200 | Despesa atualizada |
| `DELETE /api/despesas/:id` | 204 | Exclusão realizada, sem corpo de resposta |

POST e PUT recebem JSON com `id_servico` (inteiro positivo existente), `descricao` (texto obrigatório até 150 caracteres), `valor` (de 0.01 a 99999999.99), `data_despesa` (data válida `YYYY-MM-DD`, obrigatória na API) e `observacoes` (opcional/nula, até 300 caracteres). Embora a tabela tenha um default de data, a API exige a data explícita. ID é gerado pelo banco; campos desconhecidos/derivados são rejeitados. PUT substitui todos os campos editáveis, pode mudar o serviço e anula observações omitidas.

Valores aceitam número JSON ou string decimal com ponto; prefira `"25.50"`. A validação monetária é compartilhada com Serviços, com mínimo estritamente positivo para despesas. Não há arredondamento silencioso: mais de duas casas é inválido. O parâmetro SQL usa `Decimal(10,2)` e a resposta devolve string com duas casas. Data usa parâmetro `Date` e é devolvida como `YYYY-MM-DD`, sem fuso.

Não há filtro por status do serviço: concluídos e cancelados também aceitam despesas. A FK é validada antes da escrita e continua protegida pelo SQL Server contra alterações concorrentes. Não são armazenados custo total nem resultado líquido. Views e Stored Procedure financeiras permanecem intactas e refletem as despesas existentes após futuras operações autorizadas.

Erros seguem o envelope padrão: 400 para dados/IDs inválidos, serviço de destino inexistente ou violação de integridade; 404 para despesa inexistente e para consulta de despesas de serviço inexistente; 409 para conflito de unicidade; 500 genérico para falha inesperada. Não há unicidade de negócio extra: despesas com mesmos campos podem existir. Repetir DELETE após uma exclusão bem-sucedida retorna 404.

### Consultas reais de despesas

Inicie a API em `backend/` com `npm.cmd run dev` e execute em outro PowerShell, usando a porta configurada (3001 neste ambiente):

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/despesas' -Method GET -WebSession $sessao -UseBasicParsing
# Substitua pelos IDs retornados na listagem de despesas e de serviços:
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/despesas/1' -Method GET -WebSession $sessao -UseBasicParsing
Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/servicos/1/despesas' -Method GET -WebSession $sessao -UseBasicParsing
```

Esses comandos são somente de leitura. POST, PUT e DELETE foram testados exclusivamente com banco simulado; não execute escrita/exclusão no banco real sem autorização específica. A suíte cobre cadastro, atualização, exclusão, serviço ausente, serviços concluídos/cancelados, precisão, datas, parâmetros e erros. Nenhum dado real foi inserido, alterado ou excluído nesta implementação.

## Dashboard e financeiro — somente leitura

| Endpoint | Objeto SQL | Resposta 200 |
| --- | --- | --- |
| `GET /api/dashboard/resumo` | `dbo.vw_DashboardResumo` | Objeto com `receita_total`, `custos_totais`, `resultado_liquido`, `quantidade_servicos`, `servicos_em_andamento` |
| `GET /api/financeiro/servicos` | `dbo.vw_ResumoFinanceiroServico` | Array com `id_servico`, `cliente`, `placa`, `tipo_servico`, `status`, `data_inicio`, `data_conclusao`, `valor_recebido`, `custo_total`, `resultado_liquido` |
| `GET /api/servicos/:id/resumo-financeiro` | `dbo.sp_ResumoFinanceiroServico` | Objeto com `id_servico`, `cliente`, `placa`, `tipo_servico`, `status`, `valor_recebido`, `custo_total`, `resultado_liquido` |

As colunas acima foram confirmadas nos scripts SQL existentes. A procedure não retorna datas. Valores monetários são strings com duas casas, inclusive negativos e zero (`"0.00"`); contagens e IDs são números. Datas da View são strings sem fuso, preservando o contrato DATETIME2 existente.

Não há soma, subtração, filtro de cancelados ou recálculo financeiro no Node.js. A formatação converte os resultados SQL para `decimal(38,2)` e `varchar(41)` antes da leitura pelo driver, preservando também valores agregados maiores que o limite de inteiros seguros do JavaScript. Isso formata o resultado já calculado pelos objetos existentes, sem recuperar precisão eventualmente perdida dentro dos cálculos SQL originais. Serviços sem despesas recebem custo zero pelo COALESCE existente no SQL. Cancelados continuam participando dos resultados.

A execução da procedure usa parâmetro `Int` vinculado a `@id_servico`. Seu resultado é capturado em uma variável de tabela local ao batch (`INSERT INTO @resumo EXEC ...`) para convertê-lo em texto antes de chegar ao driver. Isso não altera dados de tabelas persistentes nem a procedure. O login precisa de SELECT nas Views e EXECUTE na procedure; a API não concede permissões.

Serviço inexistente retorna 404; ID inválido retorna 400; erro inesperado retorna 500 genérico. Listagem vazia retorna `[]`. A View do dashboard retorna uma linha com zeros quando não há dados; ausência inesperada dessa linha é tratada como erro, sem fabricar indicadores. Rotas financeiras não implementam POST, PUT ou DELETE.

**Interpretação:** receita/valor recebido está associado aos serviços registrados, não a datas de pagamento. Estes indicadores não representam fluxo de caixa por data de recebimento. Não há filtro por período nesta etapa.

Para validar no PowerShell, com a API iniciada via `npm.cmd run dev` em `backend/`:

```powershell
$baseUrl = 'http://127.0.0.1:3001'
Invoke-WebRequest -Uri "$baseUrl/api/dashboard/resumo" -Method GET -UseBasicParsing -WebSession $sessao
Invoke-WebRequest -Uri "$baseUrl/api/financeiro/servicos" -Method GET -UseBasicParsing -WebSession $sessao
# Substitua 1 por um id_servico existente:
Invoke-WebRequest -Uri "$baseUrl/api/servicos/1/resumo-financeiro" -Method GET -UseBasicParsing -WebSession $sessao
```

Esses endpoints não gravam dados de negócio. Os testes desta implementação utilizam apenas executor SQL simulado e não validam a execução real dos objetos: conferem os contratos HTTP, as consultas/parametrização, cancelados, ausência de despesas, precisão textual, ausência de serviço e tratamento de falhas. As consultas reais acima são a próxima validação local.

## Estrutura

```text
backend/
  src/
    config/env.ts                 # Leitura e validação do ambiente
    database/connection.ts        # Pool SQL Server e consulta de saúde
    middleware/error-handler.ts   # Erros JSON
    routes/health.ts              # Rotas de saúde
    routes/clientes.ts            # Rotas de clientes
    controllers/cliente-controller.ts
    services/cliente-service.ts
    services/cliente-validation.ts
    repositories/cliente-repository.ts
    routes/veiculos.ts
    controllers/veiculo-controller.ts
    services/veiculo-service.ts
    services/veiculo-validation.ts
    services/validation.ts         # Validação comum de IDs e textos
    repositories/veiculo-repository.ts
    routes/servicos.ts             # Serviços e listagem de tipos
    controllers/servico-controller.ts
    services/servico-service.ts
    services/servico-validation.ts
    repositories/servico-repository.ts
    routes/despesas.ts
    controllers/despesa-controller.ts
    services/despesa-service.ts
    services/despesa-validation.ts
    repositories/despesa-repository.ts
    routes/financeiro.ts
    controllers/financeiro-controller.ts
    services/financeiro-service.ts
    repositories/financeiro-repository.ts
    app.ts                        # Composição Express, sem abrir porta
    server.ts                     # Inicialização e encerramento
  tests/                          # Testes isolados, sem SQL Server real
  .env.example
  .gitignore
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.test.json
```

O frontend React/Vite usa as APIs reais; mocks permanecem apenas nos testes e no legado isolado. Nenhum objeto SQL é criado ou modificado pela API. POST/PUT de Clientes, Veículos, Serviços e Despesas e DELETE de Despesas exigem sessão e CSRF. Desenvolvimento integrado: API em 127.0.0.1:3001 e Vite em 127.0.0.1:5173 com proxy /api. O servidor recusa HOST externo; `.env` e cópias `.env.*`/`.env *` estão ignorados, com exceção do modelo `.env.example`. Não há cadastro público de usuários; veja AUTH.md.

Referências: [tratamento de erros do Express](https://expressjs.com/en/guide/error-handling/) e [conexões/configuração do mssql](https://tediousjs.github.io/node-mssql/).

### Identificação de duplicidades de Veículos

POST/PUT mantêm HTTP 409 e o envelope `{ "error": { "code": "...", "message": "..." } }`. Códigos específicos: `DUPLICATE_PLATE`, `DUPLICATE_RENAVAM` e `DUPLICATE_PLATE_AND_RENAVAM`. A consulta parametrizada compara os valores normalizados usando as regras de comparação do SQL Server e exclui o próprio ID no PUT. Conflitos em dois veículos diferentes também identificam ambos os campos.

As restrições UNIQUE permanecem intactas e arbitram concorrência. Após erro 2601/2627, o backend consulta novamente os conflitos. Sem identificação ou com falha dessa consulta, retorna `DUPLICATE_VEHICLE` com mensagem genérica segura, sem expor detalhes SQL. Não há migração ou alteração de tabelas/índices. Testes usam banco simulado.

### Conclusão de Serviços e verificação financeira

Validação de Serviços: POST e PUT exigem `data_conclusao` válida quando `status=CONCLUIDO`, retornando HTTP 400 / `VALIDATION_ERROR` se ausente. A conclusão não pode anteceder o início. EM_ANDAMENTO e CANCELADO continuam aceitando conclusão nula. PUT continua sendo substituição completa, não atualização parcial; não há PATCH. Registros antigos concluídos sem data permanecem consultáveis, mas precisam receber uma data válida ao serem salvos novamente como concluídos. Não há correção automática de registros. A verificação financeira B1, sem mudanças SQL, está em [B1_PRECISAO.md](B1_PRECISAO.md).

### Diagnóstico seguro de falhas SQL

O diagnóstico estruturado é opt-in: configure `SQL_DIAGNOSTICS=true` no `.env` local e reinicie o backend. Não é necessário mudar credenciais, TLS ou timeouts. `NODE_ENV=production` sempre desabilita os detalhes, mesmo com a opção habilitada. Ausência da opção ou `false` mantém somente os avisos genéricos existentes. Para desativar, configure `false` e reinicie. O `.env` real não é alterado automaticamente.

Os eventos JSON `backend_diagnostic` são emitidos somente em falhas, no stderr do terminal, contendo timestamp UTC, etapa, correlação gerada internamente, duração em milissegundos quando mensurável, códigos/categorias permitidos e número técnico SQL quando disponível. O estado público do pool pode incluir `connected`, `connecting`, `healthy`, `size`, `available`, `borrowed` e `pending`; campos indisponíveis são omitidos. `connected` não garante que a última consulta funcionou.

Etapas: `pool_init` (configuração/criação/conexão), `pool_wait` (espera pelo pool inicializado), `pool_event` (evento de erro do driver), `query` (request e consulta), `pool_close` (encerramento/cleanup), `health_db` (falha da verificação) e `http_unhandled` (erro não tratado que retorna 500). O driver adquire a conexão física dentro do request; a duração de `query` inclui essa espera e não distingue tempo SQL de tempo de aquisição. Eventos assíncronos e o middleware HTTP não inventam duração. A correlação acompanha o mesmo objeto de erro e causas encapsuladas reconhecidas; erros independentes ou substituídos podem ter IDs diferentes. Não é um ID de requisição HTTP e não é devolvido ao cliente.

Mensagens brutas, stack traces, consultas, parâmetros, corpos HTTP, URLs, cookies, tokens e configuração de conexão não são registrados. Códigos desconhecidos viram `UNKNOWN`. Falhas no logger não substituem o erro da operação. Respostas HTTP permanecem iguais; o health continua retornando 503 amigável, sem detalhes. Não há retries, mudança de recuperação ou cancelamento adicional.

Para observar localmente, inicie `npm.cmd run dev` em `backend/` com a opção habilitada. Em outro PowerShell, execute `curl.exe -i http://127.0.0.1:3001/api/health/db`, inclusive depois de mais de 30 segundos de inatividade. Esse endpoint executa somente SELECT. Reproduza também a navegação de consulta habitual, sem cadastrar/editar/excluir registros. Anote horário, etapas, códigos, duração e correlação quando a falha ocorrer; não é necessário desligar o SQL Server. A intermitência pode não reaparecer imediatamente.

Interpretação inicial (não equivale a diagnóstico definitivo):

| Código/categoria | Indício |
| --- | --- |
| `ETIMEOUT` / `timeout` | Limite de tempo atingido; examine etapa e estado do pool. |
| `ESOCKET`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE` | Falha/interrupção de rede ou socket. |
| `EINSTLOOKUP` | Falha na descoberta da instância nomeada. |
| `ENOTFOUND`, `EAI_AGAIN` | Falha de resolução de nome. |
| `ELOGIN` | Falha de autenticação SQL; não conclui sozinho que a senha esteja errada. |
| `ENOTOPEN`, `ECONNCLOSED` | Conexão/pool não aberto ou encerrado. |
| `EREQUEST` | Erro da operação SQL; verifique o número técnico e códigos de causas permitidos. |
| categoria `tls` | Falha de validação de certificado/TLS. |
| `ECANCEL` | Operação cancelada. |
| `UNKNOWN` | Código ausente ou fora da lista permitida; nenhum conteúdo bruto é exposto. |

Um `TimeoutError` sem código conhecido aparece como `UNKNOWN` com categoria `timeout`. Eventos correlacionados podem representar a mesma falha propagada por várias camadas, não várias indisponibilidades.
