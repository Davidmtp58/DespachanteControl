# Revisão dirigida dos três avisos altos — preparação Netlify

Nenhuma instalação/atualização foi aplicada nesta etapa; não foi usado audit fix.
Evidências: npm audit --json, npm ls e metadados oficiais dos pacotes/advisories.

| Pacote instalado | Correção identificada | Impacto no projeto |
| --- | --- | --- |
| body-parser 2.3.0, via express 5.3.0 | body-parser 2.4.0 (ramo 2.x) | Relevante: express.json usa descompressão por padrão. Login expõe parsing JSON antes de autenticar. Há risco de negação de serviço; rate limit e limite de 2 KB não substituem a correção. |
| @azure/msal-node 6.0.1 | 7.1.0 | Falha no fluxo OAuth authorization-code do MSAL. O login do produto usa bcrypt e PostgreSQL, não esse fluxo. Não foi identificado caminho de exploração na autenticação atual; a dependência ainda precisa ser corrigida. |
| @azure/identity 4.14.0 | 4.14.1 depende de @azure/msal-node ^7.1.0 | Aviso transitivo do mesmo problema MSAL, não uma terceira falha independente. Aparece na árvore de tedious/@types/mssql. Não remover o suporte SQL Server para resolver o alerta. |

Fontes: [body-parser GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[MSAL GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5).
Metadados npm consultados: `npm view @azure/identity@4.14.1 version dependencies.@azure/msal-node`.

## Solução proposta, sem atualização indiscriminada

1. Corrigir primeiro body-parser para 2.4.0 no lockfile, respeitando a faixa
   declarada pelo Express instalado. Não mudar major do Express. Testar JSON
   válido, inválido, limites, conteúdo comprimido e autenticação.
2. Atualizar @azure/identity especificamente para 4.14.1, levando a MSAL >=7.1.0
   pela dependência oficialmente declarada. Não forçar somente MSAL 7 dentro de
   identity 4.14.0, que declara ^6.0.0. Conferir todas as cópias de tedious e
   compatibilidade do driver SQL Server e tipos após resolução do lockfile.
3. Executar npm ci, npm audit, typecheck, builds, regressão SQL Server simulada,
   PostgreSQL descartável e smoke do bundle. Revisar o diff do lockfile para
   confirmar que somente as cadeias necessárias foram atualizadas.
4. Não tratar redução de contagem no audit como prova de ausência de riscos.
   O caminho vulnerável do body-parser deve ser corrigido antes do piloto público.

Esta etapa pediu análise dos avisos; a atualização dirigida fica pendente de
aprovação. Não foram enviados corpos maliciosos ao Supabase ou a serviços reais.
