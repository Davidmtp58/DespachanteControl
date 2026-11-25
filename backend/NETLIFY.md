# Netlify — preparação local, sem publicação

O React é publicado como arquivos estáticos e o Express é adaptado por
`serverless-http` em uma única Function. Esta etapa NÃO autoriza deploy.
A etapa 2 adicionou sessões e rate limit PostgreSQL obrigatórios na Function.
Consulte [AUTH-STATE.md](AUTH-STATE.md): a migração 006 ainda requer revisão e
autorização remota. Cookies, CSRF e bcrypt foram preservados.

## Entradas e build

- `src/server.ts`: servidor local/tradicional, comandos existentes preservados.
- `src/netlify-functions/api.ts`: handler sem listen, dotenv ou frontend estático.
  Cria a aplicação uma vez por instância; o pool permanece lazy e não é encerrado
  após cada chamada. Não utiliza o arquivo privado HML nem credenciais locais.
- `src/netlify-adapter.ts`: adaptação e normalização do prefixo da URL direta da
  Function para `/api`, preservando os contratos existentes.
- `../netlify.toml`: base `backend`, Node 22, publicação `../frontend/dist`,
  Functions em `dist/netlify-functions`. A pasta pública nunca é a raiz do projeto.
  Os pacotes de runtime são externalizados no esbuild para evitar quebrar imports
  dinâmicos dos drivers; devem acompanhar o pacote da Function via empacotador
  Netlify. Não foi removido o driver SQL Server.

O comando de build configurado instala dependências pelos dois lockfiles e
executa `scripts/build-hosted.mjs`. Não executa migrações, testes com banco,
servidor ou scripts administrativos. Não há comando `start` de servidor na Netlify.

`/api` e `/api/*` são reescritos antes do fallback das páginas conhecidas:
login, dashboard, clientes, veículos, serviços e despesas. A raiz serve index.html.
Não há fallback global que transforme arquivos ausentes em HTML. API sem sessão
continua retornando 401; rota API inexistente com sessão retorna 404 JSON.

## Validação local (sem banco)

Na raiz, após instalar dependências:

```powershell
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix frontend test
npm --prefix frontend run typecheck
node scripts/build-hosted.mjs
node scripts/check-netlify-bundle.mjs
Set-Location frontend
npm exec -- playwright test --config=playwright.netlify.config.ts
```

Os testes de backend invocam o handler real com eventos simulados, repositório de
usuário fictício e cookies/CSRF. Nenhum teste novo importa server.ts ou lê .env.
O smoke test empacota a entrada compilada com esbuild, carrega o bundle e verifica
health/503 sem configuração PG e sem acessar banco (falha fechada do store). Usa esbuild da ferramenta tsx
já registrada no lockfile; não adiciona outro empacotador.

O servidor de navegador da porta 4174 é apenas uma simulação das reescritas lidas
do netlify.toml. Usa o build React e o adaptador; os testes de navegação interceptam
as APIs com dados fictícios. A suíte verifica URLs diretas, F5 em cinco seções,
Voltar/Avançar, recuperação da sessão e logout. O teste de transporte verifica
health e respostas JSON sem interceptação, com banco simulado.

Não confundir essas verificações com execução em Netlify Dev, empacotamento
integral pela infraestrutura Netlify ou homologação HTTPS na nuvem. Esses testes
ainda deverão acontecer em etapa autorizada. Os testes locais HTTP não comprovam
o comportamento dos cabeçalhos de proxy da plataforma.

## Pendências antes de publicar

1. Revisar/aplicar a migração 006 mediante autorização e homologar os stores
   compartilhados já implementados localmente.
2. Homologar proxy, IP confiável, cookies Secure e CSRF em HTTPS real.
3. Disponibilizar CA privada da Function, configurar dc_runtime e dimensionar pool
   e timeouts para serverless; nenhuma credencial foi configurada nesta etapa.
4. Definir uma origem HTTPS exata e SESSION_SECRET estável. Não usar prefixos VITE_
   para segredos, nem disponibilizar credenciais a previews não confiáveis.
5. Validar pacote e dependências no ambiente Netlify, limites e monitoramento.
6. Aplicar a correção dirigida proposta em [DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md)
   para os três avisos altos. Nenhum npm audit fix foi aplicado nesta etapa.

Não importar automaticamente o repositório para publicação com credenciais reais
enquanto essas pendências permanecerem. O netlify.toml é preparação técnica,
não uma autorização de execução remota.
