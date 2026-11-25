# Política Unicode — Etapa 2.1

Decisão autorizada em 27/10/2026 para o banco PostgreSQL NOVO. Esta política
substitui a pendência NFC/NFD registrada na Etapa 2; não modifica o SQL Server
nem tenta reproduzir conversões com perda de caracteres de sua code page.

## Armazenamento e comparação são operações diferentes

- Armazenar texto de negócio em **NFC**, não NFKC/NFKD. `é` e `e` + acento
  combinante representam o mesmo texto e passam a ter representação NFC.
- NFC não remove acentos, não muda caixa e não remove espaços. `José` continua
  distinto de `Jose` na chave de igualdade. NULL permanece NULL.
- Manter `app.ci_as` e a chave `app.text_key`: NFC, remoção somente de espaços
  U+0020 finais, minúsculas e expansões ß/ss e æ/ae já aprovadas nos testes.
  Essa chave não substitui o texto exibido/armazenado. Igualdade usa COLLATE
  app.ci_as explicitamente; não presumir a collation de retorno de uma função.
- Senha, senha_hash, cookie, token CSRF, segredo de sessão e quaisquer tokens
  são byte-exatos e **NUNCA** passam por normalização Unicode.
- Não se promete ordenação universal idêntica à collation Windows. As listagens
  atuais são por ID. Não se reproduz corrupção/substituição de caracteres legada.

## Inventário exato dos 18 campos normalizados

| Tabela | Campos NFC | Efeito e unicidade |
| --- | --- | --- |
| cliente | tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email | Nome/e-mail podem conter acentos; uq_cliente_cpf_cnpj usa text_key |
| usuario | nome, email | Busca de login e uq_usuario_email usam text_key; senha_hash excluído |
| veiculo | placa, tipo_veiculo, marca, modelo, renavam | Tipo/marca/modelo podem conter acentos; uq_veiculo_placa e uq_veiculo_renavam usam text_key |
| tipo_servico | nome, descricao | uq_tipo_servico_nome e seed idempotente |
| servico | status, observacoes | CHECK de status usa text_key; observações são texto livre |
| despesa_servico | descricao, observacoes | Texto de exibição sem UNIQUE |

PF/PJ, status, documentos, placa e RENAVAM válidos usam o alfabeto já aceito pelos
validadores: NFC não o amplia. O futuro adaptador continuará validando regex,
dígitos verificadores e campos obrigatórios. Não converter caracteres fullwidth
em ASCII usando NFKC para tentar fazê-los passar na validação.

Operações afetadas: INSERT, UPDATE, UPDATE sem alteração efetiva, lookup de e-mail,
consultas de duplicidade, UNIQUE concorrente, ON CONFLICT do catálogo e projeção
de nomes/descrições nas respostas e nas Views. Cinco índices UNIQUE são reconstruídos
na migração porque dependem de text_key. Nenhum índice é removido.

O índice ix_servico_status permanece; seus valores válidos ASCII não mudam. Os
índices de data e id_servico, PKs/FKs inteiras, CHECKs monetárias/temporais e cálculos
não dependem de normalização. A View financeira agrupa também por ID do serviço:
nomes canonicamente iguais não fundem serviços nem receitas. CHECKs de tipo/status
continuam com a semântica anterior; NFC não cria novos estados.

## Implementação SQL

`005_unicode_nfc.sql` preserva as migrações 001–004 e seus checksums. Atualiza
text_key, reconstrói os cinco índices UNIQUE e cria seis triggers BEFORE
INSERT OR UPDATE com uma função SECURITY INVOKER e allowlists fixas de colunas.
Não há SQL dinâmico na função, atualização em massa, cópia de dados ou merge de
registros. Os quatro tipos iniciais já estão em NFC. A migração é transacional;
conflitos impedem aplicação, não provocam descarte automático.

Somente o novo registro passa pela normalização. Datas, IDs, dinheiro e hashes
não são reconstruídos pelo patch JSON da trigger. A API não recebe DDL ou EXECUTE
direto na função de trigger e não pode desativar triggers. Os grants existentes
para text_key permanecem; PUBLIC continua sem acesso ao schema.

Limite importante: PostgreSQL verifica varchar(n) antes da trigger. Um NFD que
exceda n caracteres pode falhar antes de ser reduzido por NFC. A trigger é defesa
adicional, não substitui normalização ANTES da validação de comprimento no Node.
Não fazer casts limitadores para truncar texto nem capturar 22001 como sucesso.

## Obrigações do futuro adaptador Node.js (não implementado)

1. Validar estrutura/tipos e selecionar apenas os campos de negócio permitidos.
2. Para strings desses campos, usar `.normalize('NFC')` antes dos limites de
   comprimento e aplicar os trims/normalizações de domínio já existentes.
3. Preservar limites e demais validações atuais; não trocar silenciosamente a
   contagem UTF-16 dos validadores JavaScript por bytes/graphemes.
4. Não percorrer indiscriminadamente o corpo de login: senha deve permanecer
   byte-exata; apenas e-mail entra na política de normalização.
5. Usar parâmetros SQL e a mesma chave nas consultas por igualdade:

```sql
WHERE app.text_key(email) COLLATE app.ci_as
    = app.text_key($1) COLLATE app.ci_as
```

6. Identificar 23505 pelos índices nomeados; manter HTTP 409, mensagens específicas
   de placa/RENAVAM e fallback seguro. Excluir o próprio ID na edição. Pré-consulta
   não substitui UNIQUE. Não logar `detail` do driver, que pode conter dados pessoais.
7. Não calcular dinheiro com Number; preservar datas civis, parser de seis casas,
   formatos HTTP e autenticação existentes. Essas adaptações pertencem à Etapa 3.

Busca por substring/LIKE não faz parte das consultas atuais. PostgreSQL 17 tem
restrições a pattern matching com collations não determinísticas; não introduzir
LIKE sobre ci_as na migração. Se houver busca SQL futura, definir e testar sua
semântica separadamente. A pesquisa atual do frontend não foi modificada.

## PostgreSQL 17 e 18

Execução real disponível: PostgreSQL 18.4 no Windows. PostgreSQL 17 e Docker não
foram encontrados no ambiente; não houve instalação de outro servidor.
**A suíte não foi executada em PostgreSQL 17.** A revisão documental confirma
normalize/NFC, JSONB, triggers, collations ICU, índices de expressão e Views
security_invoker nas versões necessárias. Isso não substitui execução real,
inclusive porque a versão ICU pode diferir entre Windows e Linux/Supabase.

Quando os binários 17 estiverem disponíveis, sem usar banco existente:

```powershell
$env:PG_TEST_BIN = 'C:\Program Files\PostgreSQL\17\bin'
npm.cmd --prefix database/postgresql test
```

Repetir com o caminho 18 para a segunda versão. O harness cria um cluster isolado
e o remove ao terminar; não recebe URLs ou credenciais de produção. Exigir essa
execução na versão/ICU do destino antes de publicar, sem bloquear o planejamento
do adaptador local. Fontes oficiais consultadas em 27/10/2026:

- https://www.postgresql.org/docs/17/functions-string.html
- https://www.postgresql.org/docs/17/collation.html

## Plano da Etapa 3 — depende de nova autorização

1. Adicionar pg/configuração/pool separado e fábrica explícita de repositórios,
   preservando o caminho SQL Server. Sem fallback silencioso nem gravação dupla.
2. Criar normalização/validação de entrada PostgreSQL e classificação de erros;
   testar NFC, limites, sete casas rejeitadas e contratos HTTP antes das entidades.
3. Adaptar Usuário e Clientes, preservando bcrypt, sessão, cookies, CSRF e 401;
   depois Veículos e conflitos de unicidade.
4. Adaptar Serviços/tipos e Despesas, mantendo relacionamentos, status, valores
   decimais como strings e serialização de datas sem conversões indevidas de fuso.
5. Adaptar financeiro somente às Views/função, sem duplicar cálculos em Node.
6. Executar suíte HTTP com PostgreSQL descartável, regressão SQL Server simulada,
   testes do navegador, tipos/builds e permissões com conta de execução.

Cada subetapa deve manter os contratos existentes, exceto NFC e precisão temporal
expressamente aprovados. Supabase, deploy e dados reais continuam fora do escopo
até autorização própria. Persistência de sessões é assunto operacional separado.
