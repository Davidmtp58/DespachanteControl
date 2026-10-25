# Despachante Control

MVP local para um despachante documentalista organizar Clientes, Veículos, Serviços, Despesas e resultados financeiros. Projeto de portfólio e extensão acadêmica com modelagem relacional e integração real entre React, API REST e SQL Server Express.

**Estado atual:** funcionalidades principais integradas e validadas manualmente no ambiente local. O projeto está em estabilização; não está preparado para hospedagem pública ou uso operacional sem validações adicionais. A publicação do código não equivale à disponibilização de um serviço em produção.

## Implementado

- Frontend React + TypeScript, Vite e layout responsivo.
- Backend Node.js + TypeScript, Express e `mssql` com driver Tedious.
- SQL Server: seis tabelas, chaves estrangeiras, UNIQUE/CHECK, duas Views financeiras, Stored Procedure e índices.
- Autenticação real por e-mail/senha com bcrypt, sessões, cookie HttpOnly/SameSite, expiração, CSRF e limite de tentativas de login.
- Clientes e Veículos: listagem, consulta, cadastro e edição. Sem DELETE. Duplicidade de placa e RENAVAM identificada por campo.
- Serviços: listagem, consulta, cadastro, edição e tipos reais. Solicitante pode diferir do proprietário do veículo. CONCLUIDO exige data de conclusão válida.
- Despesas: listagem, consulta, filtro por serviço, cadastro, edição e exclusão com confirmação.
- Dashboard financeiro com dados reais das Views; nenhum fallback silencioso para mocks.
- Navegação por URLs, acesso direto, F5 e histórico Voltar/Avançar.
- Diagnóstico técnico seguro e opcional para investigar falhas SQL.

Todos os usuários ativos autenticados têm as mesmas permissões. Não existem cadastro público, recuperação de senha ou gerenciamento de perfis.

## Arquitetura e regras financeiras

`Navegador → Vite /api → Express → mssql/Tedious → SQL Server Express`

O frontend adapta campos snake_case, mantém CSRF somente em memória e usa `credentials: 'include'`. O backend separa rotas, controllers, services, repositories, configuração e tratamento de erros. Consultas usam parâmetros; as restrições SQL continuam garantindo integridade e unicidade.

Custo total e resultado líquido são calculados no SQL, sem armazenamento redundante. Cancelados participam dos indicadores; serviços sem despesas têm custo zero. Receita é o valor recebido registrado no serviço, **não fluxo de caixa por data de pagamento**. A interface apresenta valores em reais e datas sem horário; Serviços usam DATETIME2 com adaptação para meia-noite, Despesas usam DATE.

Os testes sintéticos SQL da auditoria B1 não reproduziram perda de centavos. Consulta, resultados e limitações estão em [backend/B1_PRECISAO.md](backend/B1_PRECISAO.md). Nenhuma alteração dos cálculos foi necessária.

## Requisitos

- Windows com SQL Server Express e SSMS para o ambiente local documentado.
- Node.js 22 ou superior e npm.
- SQL Server acessível por TCP/IP. Com instância nomeada, a descoberta da porta deve estar disponível; não presuma porta 1433.
- Microsoft Edge instalado para os testes Playwright, configurados com `channel: msedge`.

Testes automatizados usam banco/API simulados e não precisam de senha real ou SQL Server disponível.

## Instalação e execução local

### 1. Banco

Para uma instalação **nova**, execute no SSMS os scripts de `database/` na ordem:

1. `01_create_database.sql`
2. `02_create_tables.sql`
3. `03_seed_data.sql`
4. `04_views.sql`
5. `05_indexes.sql`
6. `06_procedures.sql`
7. `07_analytical_queries.sql` (consultas de verificação)

Esses passos de provisionamento criam objetos e o seed de tipos de serviço. **Não reaplique o script de tabelas em um banco existente:** ele não é idempotente. O seed não cria clientes, veículos, serviços ou despesas fictícias. A API não executa migrations.

Crie/configure manualmente um login SQL com as permissões de negócio necessárias, sem usar conta administrativa na API. As instruções de acesso à tabela Usuario e preparação da primeira conta humana estão em [backend/AUTH.md](backend/AUTH.md). Concessões de permissões e criação de conta são decisões manuais do administrador, não ações automáticas da instalação.

### 2. Backend

No PowerShell, a partir da raiz:

```powershell
cd backend
npm.cmd ci
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Edite o `.env` local: host `127.0.0.1`, porta `3001`, servidor/instância/banco, credenciais SQL e segredo de sessão. Não sobrescreva um arquivo já configurado. Para `localhost\SQLEXPRESS`, use `DB_SERVER=localhost` e `DB_INSTANCE=SQLEXPRESS`; não combine instância com `DB_PORT`. O exemplo não contém credenciais.

Consulte [backend/README.md](backend/README.md) para TLS, variáveis e contratos e [backend/AUTH.md](backend/AUTH.md) para a primeira conta. Depois:

```powershell
npm.cmd run dev
```

API: **http://127.0.0.1:3001**.

### 3. Frontend

Em outro terminal, a partir da raiz:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abra **http://127.0.0.1:5173**. O Vite encaminha `/api` para `http://127.0.0.1:3001`. Use esse mesmo hostname e sua conta cadastrada; não há credenciais fixas. Detalhes: [frontend/README.md](frontend/README.md).

### 4. Verificação local

```powershell
curl.exe -i http://127.0.0.1:3001/api/health
curl.exe -i http://127.0.0.1:3001/api/health/db
```

O primeiro confirma a API; o segundo executa uma consulta simples de leitura. HTTP 200 no health não valida permissões de todos os módulos nem prova estabilidade prolongada. Endpoints de negócio exigem sessão; exemplos seguros estão no AUTH.md.

## Testes e builds

Em `backend/`:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Em `frontend/`:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:ui
```

Os testes interceptam APIs e simulam repositórios, incluindo autenticação, validações, erros e operações de escrita. Não gravam no banco real. Os cenários incluem navegação, responsividade, exclusão confirmada, duplicidade e regras financeiras. Quantidades de testes podem mudar; use o resultado da execução atual.

Builds geram `dist/`. O backend compilado inicia com `npm.cmd start`. O build do frontend não configura hospedagem/proxy: `vite preview` é uma prévia local, não servidor de produção. O uso integrado documentado é pelo Vite em desenvolvimento.

## Estrutura

- `database/`: modelagem T-SQL, seed de tipos, Views, índices, procedure e consultas.
- `backend/src/`: API, autenticação, repositórios e diagnóstico.
- `backend/tests/`: testes com banco simulado.
- `frontend/src/`: páginas reais, formulários, serviços HTTP, tipos e navegação.
- `frontend/tests/`: testes unitários e de navegador com APIs simuladas.
- `frontend/src/mocks/` e componentes antigos: legado demonstrativo preservado, sem fallback nos fluxos atuais.

## Segurança e publicação do repositório

Arquivos de ambiente reais e cópias, dependências, builds, relatórios e temporários são ignorados. Versione apenas exemplos sanitizados e os dois `package-lock.json`; use `npm ci`. O frontend nunca deve receber credenciais SQL ou segredos: variáveis incluídas no bundle são públicas.

`.gitignore` não remove arquivos já versionados. Revise `git status`, arquivos novos, diff e histórico antes de publicar. Não inclua senhas, tokens, cookies, hashes de usuários reais, backups SQL ou blocos gerados pela preparação de conta. Use somente dados sintéticos em capturas de tela e vídeos de divulgação. Arquivos legados não devem ser apagados sem revisão.

## Limites e pendências

- Falha intermitente de conexão/API ainda sem causa comprovada. Diagnóstico opcional via `SQL_DIAGNOSTICS=true`, desabilitado em produção; veja backend/README.md.
- Sessões e limite de login em memória; reiniciar o backend encerra sessões. Sem permissões por perfil.
- Sem controle de conflito de edições simultâneas, paginação no servidor ou auditoria de alterações.
- Dashboard usa duas consultas, sem snapshot transacional conjunto.
- Hospedagem exige desenho de HTTPS, origens públicas, proxy, cookies, armazenamento de sessões, backups/restauração, monitoramento e fallback SPA. A aplicação permanece restrita a loopback.
- Recuperação de senha, Kanban, agenda, SaaS e detalhamento por cards não estão implementados.

F5, navegação e duplicidades de veículos foram corrigidos. A regra B2 agora existe também no backend; registros antigos concluídos sem data continuam consultáveis, mas precisam de data válida ao serem salvos como concluídos. Essas correções não encerram a investigação da instabilidade.
