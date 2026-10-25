# DespachanteControl — Frontend

Interface administrativa local em React + TypeScript, com Vite. Autenticação, Clientes, Veículos, Serviços e o menu Despesas utilizam a API real, com cookies HttpOnly. O Dashboard também utiliza os indicadores financeiros reais da API. Consulte despesas reais no menu Despesas, com filtro por Serviço. O banco oficial permanece SQL Server.

## Executar

Requer Node.js 22 ou superior e npm; testes de navegador requerem Microsoft Edge. Use npm.cmd ci com o lockfile versionado.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Em outro terminal, na raiz do repositório, inicie o backend já configurado:

```powershell
cd backend
npm.cmd ci
npm.cmd run dev
```

O backend deve estar em `http://127.0.0.1:3001`, usando seu `.env` local existente. Abra **http://127.0.0.1:5173** e utilize sua conta cadastrada; não existem credenciais predefinidas no frontend. Consulte `../backend/AUTH.md` para preparação de conta e configuração da API. Nenhuma conta ou permissão é criada pelo frontend.

O Vite escuta somente em loopback, na porta fixa 5173, e encaminha `/api` para `http://127.0.0.1:3001`. Todas as chamadas do navegador são relativas e na mesma origem. O proxy preserva o cabeçalho Origin; `AUTH_ALLOWED_ORIGINS` no backend deve incluir `http://127.0.0.1:5173`. Para HTTP local, o cookie deve usar `SESSION_COOKIE_SECURE=false`. Não use o servidor de desenvolvimento para acesso externo. `vite preview` serve apenas para inspecionar o build; a integração local documentada utiliza `npm.cmd run dev`.

## Sessão e segurança

- Login envia `{ email, senha }` com `X-Requested-With: DespachanteControl`.
- Todas as chamadas usam `credentials: 'include'`. O navegador administra o cookie HttpOnly; o JavaScript não lê seu conteúdo.
- O token CSRF retornado por login ou `/auth/me` fica somente em memória. Logout envia `X-CSRF-Token` e aguarda a confirmação 204. Em 403, atualiza o token com `/auth/me` e tenta novamente uma única vez.
- Nenhuma credencial ou token é salvo em localStorage/sessionStorage. A senha é limpa do formulário ao terminar a tentativa.
- A abertura/reload verifica `/auth/me` antes de montar as páginas protegidas. Sessões são revalidadas ao retornar à aba e a cada minuto enquanto ela está visível. Um 401 remove as páginas e solicita novo login; falhas de rede/servidor na verificação bloqueiam o acesso até uma nova verificação bem-sucedida.
- A expiração é controlada pelo backend (30 minutos por padrão). As APIs reais continuam protegidas pelo servidor em cada requisição.
- Falha no logout é exibida e não é apresentada como encerramento bem-sucedido. Em outra aba, o logout será percebido na próxima verificação.

## Verificar

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:ui
```

Não há script de lint. O build inclui verificação estrita de TypeScript. `npm run format` formata os arquivos com Prettier.

Os testes de navegador usam Microsoft Edge instalado (`channel: msedge`) em modo headless. Iniciam ou reutilizam o Vite em `127.0.0.1:5173`. Todas as requisições `/api/**` são interceptadas por mocks, sem acessar SQL Server, pedir senha real ou gravar dados no backend. Capturas e traces ficam em `test-results/`, ignorado pelo Git. Caso use outro navegador, ajuste o canal em `playwright.config.ts`.

## Telas e comportamento

- Login real e logout com sessão; Clientes, Veículos, Serviços e Despesas integrados à API; Dashboard financeiro real.
- Cadastros, edição, visualização e busca de clientes e veículos.
- Filtros de status, tipo de serviço, cliente e período da data de início.
- Cadastro e edição de serviços com solicitante independente do proprietário.
- Detalhe real do serviço com seus dados cadastrais, sem custos/despesas fictícios.
- Dashboard com totais SQL e Serviços recentes reais, sem cards clicáveis ou detalhes demonstrativos.
- Menu Despesas com listagem real, consulta, filtro por Serviço, cadastro, edição e exclusão com confirmação explícita.
- Layout responsivo, menu móvel, diálogos com foco gerenciado e fechamento por Escape.

Os módulos usam exclusivamente APIs reais. O botão **Novo serviço** do Dashboard abre o cadastro real em Serviços; **Ver todos** abre a lista real. A aplicação não importa mais o repositório demonstrativo para inicializar a interface. Arquivos legados de demonstração permanecem no repositório, sem acesso pela navegação. Recarregar preserva a sessão, se válida.

## Clientes: contrato e validação local

`src/services/clientes.ts` mapeia `id_cliente`, `tipo_pessoa`, `nome_razao_social`, `cpf_cnpj`, `telefone`, `email` e `data_nascimento` para o tipo de apresentação `Cliente`. IDs retornados pelo servidor viram strings; nenhum ID é enviado no corpo de criação/edição. Opcionais vazios são enviados como `null`. Datas usam `YYYY-MM-DD`, sem conversão de fuso. `data_cadastro` continua sob responsabilidade do backend.

Listagem usa `GET /api/clientes`; visualizar e abrir edição consultam `GET /api/clientes/:id`. Cadastro envia `POST /api/clientes`; edição envia `PUT /api/clientes/:id`, com cookies e `X-CSRF-Token` obtido da sessão em memória. Não há DELETE nem fallback para mocks. Um 401 bloqueia imediatamente os módulos e pede novo login. Erros 400/409 mantêm o formulário; 403 pede recarga da página. Gravações não são repetidas automaticamente. Em falha de rede durante o salvamento, confira a lista antes de reenviar, pois o servidor pode ter recebido a operação.

Para validar manualmente no SQL Server real:

1. Inicie backend na porta 3001 e frontend na 5173 conforme acima; entre com sua conta existente.
2. Abra **Clientes**, pesquise um registro e use **Visualizar**. Os dados devem corresponder ao SQL Server; os campos da visualização ficam bloqueados.
3. Quando desejar autorizar uma gravação manual, use **Novo cliente** com dados de teste e CPF/CNPJ válido e ainda não cadastrado. Salvar deve retornar 201 na aba Network e atualizar a lista.
4. Edite esse registro de teste: o PUT deve retornar 200 e a lista mostrar os novos valores. F5 deve preservar o registro no banco.
5. Um documento duplicado deve retornar 409 e manter os dados do formulário. Campos inválidos devem ser rejeitados pelo formulário ou pela API (400).
6. Veículos e Serviços devem oferecer esses clientes reais nos respectivos relacionamentos. Uma falha da API de Clientes deve exibir erro, nunca registros fictícios como substitutos.

Os testes automatizados não executam essas gravações reais: interceptam a API. A verificação manual com a conta e os dados locais fica a cargo do usuário.

## Veículos: contrato e validação local

`src/services/veiculos.ts` mapeia `id_veiculo`, `id_cliente_proprietario`, `tipo_veiculo`, `placa`, `marca`, `modelo`, `ano` e `renavam` para o tipo React `Veiculo`. IDs são strings na apresentação; o proprietário é enviado como inteiro no JSON. `ano` vazio vira `null`, RENAVAM continua string para preservar zeros iniciais. Não são enviados ID do veículo ou `data_cadastro` no corpo.

Listagem usa `GET /api/veiculos` e `GET /api/clientes`; consulta e edição carregam `GET /api/veiculos/:id`. A lista de proprietários é atualizada ao abrir o formulário, sempre pela API real. Cadastro usa POST e atualização usa PUT, com `credentials: 'include'` e o CSRF já mantido em memória pela autenticação. Não há DELETE, repetição automática de gravações ou fallback para mocks. HTTP 401 retorna ao login. 400, 404 e 409 exibem mensagens específicas; detalhes internos do servidor não são exibidos.

Placas aceitas: antigas (`ABC1234` ou `ABC-1234`) e Mercosul (`ABC1D23`), normalizadas para maiúsculas sem hífen. RENAVAM exige exatamente 11 dígitos, conforme o backend atual, sem inventar validação de dígito verificador. Tipo de veículo é texto obrigatório de até 30 caracteres, marca até 50 e modelo até 80. Ano é opcional, inteiro entre 1000 e 9999, conforme o contrato existente. O backend confirma a existência do proprietário e arbitra duplicidades pela restrição UNIQUE.

Para validar manualmente no navegador, com backend na porta 3001 e frontend em `http://127.0.0.1:5173`:

1. Faça login, abra **Veículos** e confira placas e proprietários reais. Pesquise por placa, modelo, RENAVAM ou nome do proprietário; use **Visualizar** (GET 200).
2. Quando decidir gravar manualmente, clique em **Novo veículo**, selecione um cliente real e informe dados de teste com placa e RENAVAM ainda não cadastrados. Salvar deve retornar POST 201 e atualizar a lista.
3. Edite o registro de teste e, se necessário, troque o proprietário por outro cliente real. O PUT deve retornar 200 e a listagem refletir os valores novos.
4. Pressione F5 em Veículos: a seção, a sessão e os registros persistidos devem ser preservados.
5. Duplicar placa ou RENAVAM deve retornar 409 e manter o formulário. Sem clientes cadastrados, a tela orienta cadastrar um cliente; não oferece proprietários fictícios.

Essas etapas de escrita são manuais e opcionais. Os testes automatizados usam API simulada, inclusive para proprietários inexistentes, erros e expiração de sessão, sem alterar SQL Server.

## Serviços: contrato e validação local

Correção do select de solicitantes: havia dois formulários acessíveis. O menu Serviços usava `ServicoRealForm`, enquanto os atalhos do Dashboard abriam o formulário antigo com os cinco clientes de `mocks/data.ts`. O atalho de criação agora usa `ServicosPage` e a mesma API de Clientes do módulo integrado. A lista não tem paginação, `limit`, `slice` ou filtro por proprietário; todas as opções retornadas são renderizadas. Referências são atualizadas a cada abertura de cadastro/edição. Testes com oito e nove clientes conferem a quantidade e os IDs das opções, inclusive clientes adicionados após carregar a tela. Não houve alteração de backend ou SQL.

`src/services/servicos.ts` mapeia `id_servico`, `id_cliente`, `id_veiculo`, `id_tipo_servico`, `data_inicio`, `data_conclusao`, `status`, `valor_recebido` e `observacoes` para `ServicoReal`. IDs são strings na interface e inteiros no JSON. Valores monetários permanecem strings decimais com duas casas; não há cálculo de custos ou resultado líquido nesta integração. O valor recebido é associado ao serviço, não a uma data de pagamento.

Datas no domínio do frontend são apenas `AAAA-MM-DD`, com controles `type="date"` e exibição sem horário. API e banco permanecem DATETIME2: o adaptador envia `AAAA-MM-DDT00:00:00`, sem UTC ou conversões de fuso. Na leitura, extrai a data civil do timestamp. Horários legados deixam de aparecer; ao salvar explicitamente um registro, suas datas são normalizadas para meia-noite. Não há migração automática de dados. O frontend exige conclusão para CONCLUIDO e rejeita conclusão anterior ao início; EM_ANDAMENTO aceita conclusão vazia (`null`). Registros legados concluídos sem data continuam legíveis, mas exigem preenchimento ao salvar. O backend não foi alterado para impor essa nova obrigatoriedade a outros consumidores da API.

Valor recebido inicia em `0,00` e valores carregados sempre mostram duas casas com vírgula. A máscara interpreta os dígitos como centavos: digitar `35050` produz `350,50`. Duas casas ficam sempre visíveis, inclusive durante a digitação; limpar produz `0,00`. Letras, negativos e valores acima do limite DECIMAL(10,2) são rejeitados. No envio, operações de texto convertem `350,50` para a string decimal `"350.50"`, aceita pela API e compatível com DECIMAL(10,2), sem arredondamentos de ponto flutuante. Observações seguem o contrato existente: até 500 caracteres, sem quebras de linha. Status permitidos: EM_ANDAMENTO, CONCLUIDO e CANCELADO.

GET `/api/servicos`, GET `/api/servicos/:id`, POST `/api/servicos` e PUT `/api/servicos/:id` utilizam cookies e CSRF existentes. GET `/api/tipos-servico` fornece os tipos reais. As referências são recarregadas ao abrir o formulário. Solicitante pode ser diferente do proprietário do veículo; a interface exibe o proprietário sem filtrar veículos pelo solicitante. O contrato atual exige existência do tipo, não `ativo=true`; tipos inativos retornados pela API são identificados como inativos e preservados. Nenhuma regra nova de status ou relacionamento foi imposta ao backend.

Falhas em qualquer lista de referência bloqueiam o carregamento, sem fallback. HTTP 401 retorna ao login; erros de validação/relacionamento mantêm o formulário. Após escrita confirmada, o formulário fecha e a lista é recarregada. Gravações não são repetidas automaticamente. Em falha de conexão durante o envio, confira a lista antes de reenviar.

Validação manual com backend na porta 3001 e frontend em `http://127.0.0.1:5173`:

1. Faça login e abra **Serviços** pelo menu. Confira listagem, filtros e **Visualizar** (GET 200). Despesas, custos e resultado líquido não devem aparecer como valores reais.
2. Quando decidir gravar manualmente, use **Novo serviço**: selecione cliente, veículo e tipo reais; informe início pelo calendário (por exemplo, `2026-10-16`) (ajuste para a data desejada), status e valor. O solicitante pode ser outro cliente que não o proprietário. POST deve retornar 201 e atualizar a lista.
3. Edite o registro de teste: PUT deve retornar 200. Confira datas sem horário e valor com duas casas, como `350,50`; salvar normaliza horários legados para meia-noite. Conclusão anterior ao início e valor negativo ou com mais de duas casas devem ser rejeitados.
4. Confira EM_ANDAMENTO, CONCLUIDO e CANCELADO. Cancelar preserva o registro e valor recebido. F5 preserva a seção Serviços, os dados e a sessão.
5. Após uma alteração manual, abra ou atualize o Dashboard para consultar os totais SQL atualizados. Não há DELETE de serviços.

Testes automatizados interceptam todas as APIs, sem usar senha ou gravar no SQL Server real.

## Pendências conhecidas do MVP

A perda da seção ao pressionar F5 foi corrigida com navegação por URL (veja abaixo).

- **Falhas intermitentes relacionadas à API:** relatadas pelo usuário, ainda sem diagnóstico. Investigar separadamente com contexto da operação e resposta HTTP, sem registrar credenciais. Não tratadas nesta integração.

## Navegação por URL

As seções são `/dashboard`, `/clientes`, `/veiculos`, `/servicos` e `/despesas`.
O hook React em `src/navigation.ts` acompanha a History API (`pushState`,
`replaceState` e `popstate`), sem dependência adicional para estas cinco rotas.
O menu, os atalhos do Dashboard, Voltar/Avançar e links diretos usam a URL como
fonte da seção atual. F5 restaura a seção após verificar o cookie com `/api/auth/me`.
Formulários abertos, filtros e alterações ainda não salvas não são persistidos.

Durante a verificação de sessão, a URL é preservada e os módulos ficam bloqueados.
Sem sessão, o acesso é encaminhado a `/login?next=/secao`; após login, somente
destinos internos conhecidos são aceitos. Logout confirmado vai para `/login`.
Voltar após logout não libera páginas protegidas. `/` e caminhos desconhecidos
levam ao Dashboard quando autenticado, ou ao login quando não autenticado.
Cookies, CSRF e validação de sessão continuam sob responsabilidade do AuthGate.

Para validar localmente, execute backend e frontend com `npm run dev` em seus
respectivos diretórios. Abra `http://127.0.0.1:5173/clientes`, faça login se
necessário, navegue entre todas as seções, pressione F5 e use Voltar/Avançar.
Teste também logout seguido de Voltar e de acesso direto a `/despesas`.
Esses passos de navegação não exigem gravações no banco. Os testes automatizados
usam exclusivamente APIs simuladas, incluindo recuperação de sessão pendente.

**Hospedagem futura:** o Vite já oferece fallback de SPA no desenvolvimento.
O servidor de produção deve servir `index.html` para as rotas do frontend
(por exemplo, `/clientes`), inclusive em acesso direto/F5. Configure a regra
de fallback após as regras de arquivos estáticos e `/api`; requisições de API
devem ir ao backend e nunca receber `index.html`. Preserve a mesma origem para
cookies e as configurações de segurança do backend. O build sozinho não configura
esse fallback no servidor de hospedagem.

## Despesas: integração real e validação manual

Acesse **Despesas** no menu lateral. Esta página utiliza exclusivamente os Serviços retornados pela API. Cada despesa identifica o atendimento pelo tipo de serviço, nome do cliente solicitante, marca/modelo/placa do veículo e status, com o ID do Serviço em segundo plano. O filtro e o formulário incluem essas descrições, a data de início e o ID para distinguir atendimentos semelhantes. As listas reais de Clientes, Veículos, Serviços e Tipos de Serviço são carregadas em paralelo e indexadas por ID, sem consultas individuais por despesa. Relacionamentos não encontrados são identificados explicitamente; falhas das APIs bloqueiam a apresentação, sem nomes inventados ou fallback. Opções são atualizadas ao abrir o formulário. Serviços concluídos e cancelados continuam disponíveis, conforme as regras existentes.

Contratos utilizados:

- GET `/api/despesas`: array de despesas.
- GET `/api/despesas/:id`: objeto da despesa consultada antes de visualizar, editar ou confirmar exclusão.
- GET `/api/servicos/:id/despesas`: array utilizado pelo filtro por Serviço; serviço inexistente retorna 404.
- POST `/api/despesas`: retorna 201 e a despesa criada.
- PUT `/api/despesas/:id`: retorna 200 e a despesa atualizada.
- DELETE `/api/despesas/:id`: retorna 204, sem corpo, somente após **Confirmar exclusão**. Cancelar, fechar ou pressionar Escape não exclui.

Campos enviados: `id_servico` (inteiro), `descricao` (obrigatória, até 150 caracteres), `valor` (string decimal positiva, máximo `99999999.99`), `data_despesa` (`YYYY-MM-DD`) e `observacoes` (até 300 caracteres ou `null`). Textos não aceitam caracteres de controle ou quebras de linha. O backend retorna esses campos e `id_despesa`. SQL usa `DATE` para a data e `DECIMAL(10,2)` para o valor; não é necessário horário nem conversão de fuso.

A máscara monetária reutiliza o padrão de Serviços: digite `35050` para obter `350,50`; duas casas são sempre visíveis. Zero é exibido inicialmente, mas não pode ser salvo como despesa. Letras, negativos e valores acima do limite são bloqueados. O envio usa `"350.50"`, com manipulação de strings, sem arredondamento de ponto flutuante. Não há cálculo financeiro redundante; os totais podem ser consultados ao abrir ou atualizar o Dashboard.

Todas as requisições usam `credentials: 'include'`; POST, PUT e DELETE enviam `X-CSRF-Token` em memória. HTTP 401 encerra a sessão na interface. Erros não exibem detalhes internos. Falhas de API não substituem dados por mocks. Uma resposta de escrita confirmada fecha o modal antes de recarregar a lista: falha posterior de recarga é informada separadamente. Em falha de rede durante a escrita, confira a lista antes de repetir a operação.

Validação manual, com backend em `127.0.0.1:3001` e frontend em `http://127.0.0.1:5173`:

1. Faça login, abra **Despesas** e visualize uma despesa. Confira descrição, Serviço, valor e data.
2. Use **Filtrar por serviço**. Verifique no Network do navegador GET `/api/servicos/:id/despesas`, inclusive o estado vazio para serviço sem despesas.
3. Quando decidir gravar manualmente, crie uma despesa de teste em um Serviço real: descrição identificável, `350,50` e uma data. POST deve retornar 201 e atualizar a lista. Zero e descrição vazia devem impedir o envio.
4. Edite essa despesa; confira as duas casas e a data preservada. PUT deve retornar 200. Despesas também podem ser vinculadas a Serviços concluídos/cancelados.
5. No seu registro de teste, clique em excluir e depois **Cancelar**: nenhuma chamada DELETE deve ocorrer. Só confirme quando desejar remover de fato o registro; espere 204 e a atualização da listagem.
6. Recarregue Despesas para conferir persistência: F5 mantém a seção atual.

No SSMS, esta consulta somente de leitura permite comparar os registros e relacionamentos reais. Ajuste o ID do serviço:

```sql
USE DespachanteControl;
DECLARE @id_servico INT = 7;
SELECT d.id_despesa, d.id_servico, d.descricao, d.valor,
       d.data_despesa, d.observacoes, s.status
FROM dbo.DespesaServico AS d
JOIN dbo.Servico AS s ON s.id_servico = d.id_servico
WHERE d.id_servico = @id_servico
ORDER BY d.id_despesa;
```

Os testes `tests/despesas.test.ts` e `tests/browser/despesas.spec.ts`, com `despesas-mock.ts`, simulam todas as APIs. Nenhum teste grava, altera ou exclui registros do SQL Server real.

## Organização

- `src/App.tsx`: coordenação das telas; src/navigation.ts mantém a seção pela URL e History API.
- `src/components/AuthGate.tsx`: verificação de sessão, proteção de páginas e logout.
- `src/services/auth.ts`: contratos e cliente HTTP de autenticação.
- `src/services/clientes.ts`: cliente HTTP e mapeamento de Clientes.
- `src/pages/ClientesPage.tsx`: listagem, consulta e formulário de Clientes reais, separados do estado demonstrativo.
- `src/services/veiculos.ts` e `src/pages/VeiculosPage.tsx`: contrato HTTP, validações, listagem e formulário de Veículos com proprietários reais.
- `src/services/servicos.ts`, `src/pages/ServicosPage.tsx` e `src/components/ServicoRealForm.tsx`: contratos, formatos precisos e fluxos de Serviços reais.
- `src/layouts/Layout.tsx`: sidebar, barra superior e estrutura responsiva.
- `src/components/ui.tsx`: componentes compartilhados, indicadores de status e diálogo.
- `src/components/forms.tsx`: formulários de cliente, veículo, serviço e despesa.
- `src/pages/`: login, dashboard, listagens e detalhe operacional.
- `src/types/index.ts`: contratos TypeScript, alinhados às entidades existentes.
- `src/mocks/data.ts`: dados demonstrativos isolados dos componentes.
- `src/services/gestao.ts`: contrato `GestaoService`, adaptador em memória e validações.
- `src/services/financeiro.ts`: formatação e cálculos monetários em centavos.
- `src/styles.css`: estilos e breakpoints responsivos.
- `tests/gestao.test.ts`: regras de negócio e alterações financeiras.
- `tests/browser/fluxos.spec.ts`: fluxo completo no navegador e layout móvel.
- `tests/auth.test.ts` e `tests/browser/auth.spec.ts`: contrato HTTP, restauração de sessão, CSRF, expiração e falhas de autenticação com mocks.
- `tests/clientes.test.ts`, `tests/browser/clientes.spec.ts` e `tests/browser/clientes-mock.ts`: contrato, listagem, cadastro, edição, erros e isolamento dos relacionamentos com API simulada.
- `tests/veiculos.test.ts`, `tests/browser/veiculos.spec.ts` e `tests/browser/veiculos-mock.ts`: contratos e fluxos de Veículos, proprietários reais, validações, erros e isolamento de Serviços.
- `tests/servicos.test.ts`, `tests/browser/servicos.spec.ts` e `tests/browser/servicos-mock.ts`: contratos e fluxos de Serviços reais com API simulada.

## Regras financeiras

Custo total = soma das despesas do serviço.

Resultado líquido = valor recebido − custo total.

O status é operacional. Serviços cancelados continuam somando receita e despesas nos indicadores. O resultado não é editável nem armazenado. Sem despesas, o custo é zero. O serviço pode ter resultado negativo.

## Integração atual e limites

Autenticação, Clientes, Veículos, Serviços e Despesas usam chamadas reais nesta etapa. O Dashboard consulta as Views financeiras por meio da API; não usa `GestaoService` em memória. Datas de serviços reais usam precisão de dia no frontend, com adaptação para DATETIME2 à meia-noite na API. Datas de despesas já usam DATE no banco. As gravações enviam o token CSRF em memória e tratam 401 para invalidar a sessão da interface.

O README da raiz e os arquivos de `database/` não são modificados por este frontend.

## Dashboard financeiro real

O Dashboard consulta em paralelo GET `/api/dashboard/resumo` e GET `/api/financeiro/servicos`. Não realiza chamadas individuais por Serviço. GET `/api/servicos/:id/resumo-financeiro` foi inspecionado e permanece disponível no backend para consultas individuais futuras; não é necessário para esta tela.

O resumo retorna `receita_total`, `custos_totais`, `resultado_liquido`, `quantidade_servicos` e `servicos_em_andamento`. A lista financeira já retorna `id_servico`, `cliente` (solicitante), `placa`, `tipo_servico`, `status`, `data_inicio`, `data_conclusao`, `valor_recebido`, `custo_total` e `resultado_liquido`. Nenhuma consulta de Clientes/Veículos/Despesas é necessária para compor esse Dashboard.

Valores monetários vêm como strings DECIMAL(38,2). O frontend apenas normaliza e formata as strings, incluindo negativos e centavos além da precisão segura de Number; não refaz somas nem subtrações financeiras. Cards usam o resumo SQL; linhas usam os resultados por Serviço da View. A tabela mostra os seis Serviços mais recentes por data de início. A contagem complementar por status usa a lista completa, não somente os seis exibidos.

As Views incluem cancelados e retornam custo zero quando não há despesas. Cada receita é considerada uma vez por Serviço; despesas são agregadas pelo SQL. Receita significa valor recebido registrado no Serviço, não fluxo de caixa por data de pagamento. Nenhuma informação de pagamento foi criada. Contagens demonstrativas de Clientes/Veículos e caminhos antigos de detalhes fictícios foram retirados da tela. Cards permanecem não clicáveis.

A tela carrega ao entrar e permite **Atualizar Dashboard**. Loading e erros não mostram zeros inventados nem dados antigos como se fossem atuais. Resumo e lista são atualizados em conjunto na interface. As duas consultas HTTP não constituem um snapshot transacional: se houver alterações simultâneas por outro usuário, atualize novamente para conferir os valores. HTTP 401 solicita login, e todas as consultas usam cookies e cache desabilitado. Não houve alteração de backend ou SQL.

Validação manual:

1. Inicie backend (porta 3001) e frontend com `npm.cmd run dev` nas respectivas pastas. Acesse `http://127.0.0.1:5173` e faça login.
2. Confira os cinco cards, os status, Serviços recentes, custos zero e eventuais resultados negativos.
3. Use **Atualizar Dashboard** e confira no Network somente os dois endpoints financeiros, sem consultas por Serviço.
4. Compare os valores no SSMS com estas consultas somente de leitura:
```sql
USE DespachanteControl;
SELECT * FROM dbo.vw_DashboardResumo;
SELECT * FROM dbo.vw_ResumoFinanceiroServico ORDER BY data_inicio DESC, id_servico DESC;
-- Opcional: ajuste o ID para um Serviço existente.
EXEC dbo.sp_ResumoFinanceiroServico @id_servico = 7;
```
5. Se desejar testar falhas, pare temporariamente a API e atualize: deve aparecer erro, sem fallback. Reinicie e atualize para recuperar.
6. Ao voltar ao Dashboard após suas alterações manuais em Serviços/Despesas, os indicadores serão consultados novamente. Nenhum teste automatizado escreve no banco real.

Testes específicos: `tests/dashboard.test.ts`, `tests/browser/dashboard.spec.ts` e `tests/browser/dashboard-mock.ts`. O bootstrap de mocks de autenticação fornece também os endpoints financeiros simulados para as regressões das demais páginas.

### Duplicidade de Veículos

HTTP 409 identifica `DUPLICATE_PLATE`, `DUPLICATE_RENAVAM` ou `DUPLICATE_PLATE_AND_RENAVAM`. O formulário apresenta a mensagem junto a cada campo afetado, preservando os dados preenchidos. `DUPLICATE_VEHICLE` e conflitos desconhecidos continuam com mensagem geral segura. A identificação vem do backend, não de comparação com a listagem do navegador.

Para validar manualmente, reinicie backend/frontend e use registros destinados a testes. No cadastro e na edição, tente uma placa existente com RENAVAM livre, depois um RENAVAM existente com placa livre e, por fim, ambos existentes. Confira HTTP 409 e as mensagens nos campos. Edite um veículo sem alterar placa/RENAVAM: deve salvar normalmente (200). Um cadastro válido retorna 201. A edição e o cadastro bem-sucedidos gravam no banco; execute-os manualmente somente nos registros de teste desejados.


## Publicação e operação

MVP local em estabilização, sem prontidão para hospedagem pública ou uso operacional sem validações adicionais. A investigação da instabilidade SQL permanece aberta. Consulte o README da raiz para instalação completa e limites. A regra de conclusão obrigatória também é aplicada pelo backend. Os testes SQL de precisão B1 não reproduziram perda de centavos; ver backend/B1_PRECISAO.md. Arquivos .env reais e cópias são ignorados em qualquer pasta; não coloque segredos em variáveis do Vite, pois o bundle é público. Nenhum legado demonstrativo foi removido.
