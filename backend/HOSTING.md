# Render Web Service + Supabase HML — preparação local

React compilado e Express usam um único domínio HTTPS. A entrada é
backend/src/server.ts, compilada em backend/dist/server.js, sem serverless-http.
O servidor já resolve frontend/dist corretamente a partir do arquivo compilado.
Netlify permanece no repositório como alternativa inativa; não usar sua entrada.
Nenhum recurso remoto foi criado e nenhum deploy foi realizado.

## Criar o serviço somente após autorização

O render.yaml descreve um Web Service Node Free, sem banco Render, migrações
ou hooks administrativos. Auto-deploy está desligado. Criar um serviço ou
Blueprint pode iniciar o PRIMEIRO deploy mesmo assim: aguardar autorização.
Escolher região próxima ao Supabase Ohio dentre as disponíveis; medir latência
posteriormente, sem alterar a região do banco.

- Root Directory: raiz do repositório (deixar vazio).
- Runtime: Node; plano: Free; Auto Deploy: Off.
- Build Command:

```sh
npm ci --prefix backend --include=dev && npm ci --prefix frontend --include=dev && node scripts/build-hosted.mjs
```

- Start Command: `npm --prefix backend start`.
- Health Check Path: `/api/health`, sem consulta periódica ao banco.
- Node: linha 22 explícita; conferir a versão selecionada na homologação.

Não executar Vite dev/preview, testes ou migrações no startup. Antes de criar o
serviço, confirmar que o commit remoto contém esta preparação revisada; ainda
não houve commit/push. Configurar origem, CA e segredos antes do primeiro deploy.

## Variáveis privadas no painel

Não copiar .env local nem cadastrar Secret File chamado .env. O checkout deve
conter somente exemplos seguros. dotenv não substitui variáveis já fornecidas
pelo processo. Nunca colocar segredos em variáveis VITE_ ou no bundle React.

| Variável | Configuração |
| --- | --- |
| NODE_ENV / APP_MODE | production / hosted |
| HOST | 0.0.0.0 |
| PORT | fornecida pelo Render, normalmente 10000; não fixada no YAML |
| TRUST_PROXY_HOPS | 1 |
| SESSION_COOKIE_SECURE | true |
| AUTH_STATE_STORE / DB_PROVIDER | postgres / postgres |
| AUTH_ALLOWED_ORIGINS | origem HTTPS exata atribuída ao serviço, sem barra final/caminho/curinga |
| SESSION_SECRET | segredo privado estável, hexadecimal de pelo menos 32 bytes; gerar fora dos logs |
| SESSION_TTL_MINUTES | padrão 30; máximo existente 1440 |
| LOGIN_WINDOW_MINUTES / LOGIN_MAX_ATTEMPTS | padrões 15 / 10 |
| PG_HOST | hostname real do Session pooler no Connect do Supabase HML, nunca IP inventado |
| PG_PORT | 5432; confirmar no painel, não usar Transaction pooler |
| PG_DATABASE | banco real do projeto HML, preenchido privadamente |
| PG_USER | login dc_runtime do Session pooler com sufixo do projeto; nunca postgres |
| PG_PASSWORD | senha exclusiva existente de dc_runtime, somente no painel |
| PG_SSL_MODE | verify-full |
| PG_SSL_CA_FILE | /etc/secrets/supabase-ca.crt |
| PG_POOL_MAX | 3 para o piloto, sem alterar padrão local |
| PG_CONNECTION_TIMEOUT_MS | 5000, valor atual |
| PG_IDLE_TIMEOUT_MS | 30000, valor atual |
| PG_STATEMENT_TIMEOUT_MS | 15000, aplicado pelo pool existente |

Adicionar o CA verdadeiro como Secret File supabase-ca.crt no painel. Não incluir
certificado ou credenciais no Git. Valores sync:false no YAML precisam ser
preenchidos privadamente. Não cadastrar configuração SQL Server além de
DB_PROVIDER=postgres. O driver pg preserva rejectUnauthorized:true e validação
do hostname com o CA. Não definir NODE_TLS_REJECT_UNAUTHORIZED=0 nem desabilitar TLS.
Salvar Secret Files pode disparar deploy; fazer isso somente na etapa autorizada.
Para variáveis, usar Save only quando disponível até concluir a configuração.

Confirmar previamente o estado da migração 006 e permissões de dc_runtime, sem
executá-las neste procedimento. Health 200 não comprova tabelas/permissões.

## HTTPS, proxy, cookies e sessão

Render termina TLS e encaminha HTTP à porta interna Node, que não é publicada
diretamente. Express confia em um salto. O socket é real, sem a marcação
artificial encrypted=true do serverless-http. HTTP sem indicação segura não
emite cookie Secure nos testes locais.

TRUST_PROXY_HOPS=1 sozinho NÃO autentica headers: exige ingresso exclusivo pelo
proxy Render e protocolo/IP corretamente fornecidos por ele. Antes do piloto,
homologar HTTP→HTTPS e tentativas de falsificar X-Forwarded-Proto, Forwarded,
X-Forwarded-For e Host. Interromper liberação se a topologia divergir; testes
locais não provam sanitização na plataforma. Não acrescentar CDN/proxy sem revisão.

React usa /api e credentials:include, sem URL de API externa ou CORS adicional.
Preservar origem HTTPS exata, CSRF, HttpOnly, SameSite=Strict e Secure. Somente
rotas SPA conhecidas recebem index.html; API mantém JSON e assets ausentes 404.

Sessões, revogações e limite de login ficam no PostgreSQL, sem fallback para
memória. Reinício/suspensão não os apaga; a expiração absoluta permanece. Manter
SESSION_SECRET estável. Falhas de armazenamento bloqueiam autenticação.

## Validação local sem acesso ao banco

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix backend run typecheck
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run typecheck
node scripts/build-hosted.mjs
Push-Location frontend
try { npm.cmd exec -- playwright test --config=playwright.hosted.config.ts } finally { Pop-Location }
```

A suíte completa backend contém quatro falhas conhecidas de transporte Netlify.
Não foram removidas, ignoradas ou enfraquecidas. hosting.test.ts testa Express
com proxy simulado, cookies e CSRF. O navegador hosted serve o build pelo Express
e intercepta APIs fictícias; não conecta ao Supabase. Não executar testes SQL
ou scripts administrativos como parte do build.

Após deploy autorizado: conferir health, F5/links diretos nas cinco seções,
login, sessão, CSRF, logout/401 e sessão após reinício antes do prazo. Primeiro
somente leituras. Escritas comerciais dependem de autorização própria. Conferir
logs sem segredos, memória RSS e comportamento após suspensão.

## Limitações do piloto

- Free: 512 MB RAM; suspensão após 15 minutos sem tráfego, com despertar que pode
  levar cerca de um minuto. O timeout do frontend pode expirar; não repetir
  escritas automaticamente nem tratar falha como sucesso.
- A cota de 750 horas mensais é compartilhada pelo workspace. Conferir também
  banda e minutos de build: excedentes podem gerar cobrança ou suspensão,
  conforme forma de pagamento e limites definidos. Tráfego externo excessivo
  (inclusive banco remoto) pode resultar em suspensão. Não ativar upgrades ou
  cobranças adicionais sem decisão explícita.
- Pool limitado a 3 conexões por processo. Instâncias adicionais multiplicam
  consumo; considerar limites/pausas do Supabase Free.
- Vite/TypeScript somente no build. bcrypt custo 12 consome CPU. A fábrica ainda
  importa drivers SQL Server, que contribuem com memória mesmo em PostgreSQL.
  Não foram removidos. Medir RSS antes de otimizar; não impor heap arbitrário.
- Disco efêmero: sessões/dados no PostgreSQL; não guardar backups ou dados de
  negócio no filesystem do serviço. O CA deve ser Secret File.
- Mensagem antiga de shutdown menciona SQL Server mesmo com PostgreSQL; não
  significa seleção errada de provedor. Não foi alterada nesta preparação.
- Não habilitar previews com segredos HML. Revisar DEPENDENCY-REVIEW.md e backups
  antes de informações pessoais reais. Não afirmar RAM ou TLS remoto homologados.
- Uso operacional exige validações adicionais; piloto não é garantia de SLA.

Referências oficiais: https://render.com/docs/web-services,
https://render.com/docs/blueprint-spec,
https://render.com/docs/configure-environment-variables,
https://render.com/docs/free e https://render.com/pricing.
