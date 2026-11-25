# Limpeza controlada TESTE_HML_F42F — preparação

Status: nenhuma consulta remota ou exclusão executada por esta preparação.
Os IDs foram confirmados pelo usuário após diagnóstico no HML: clientes 1 e 3,
veículos 1 e 2, serviços 1, 2 e 3, despesas 1, 2 e 3. São 10 registros.
Dependências externas e IDs não marcados: listas vazias. Esses resultados não
substituem as verificações dentro da transação nem autorizam sua execução.

## 1. Diagnóstico somente de leitura

Confirmar no painel Connect o projeto `despachante-control-hml`, referência
`zhonseyahndqlzoygolr`. Não basta o nome do banco `postgres`.
Usar Session pooler `aws-0-us-east-2.pooler.supabase.com:5432`, banco `postgres`,
login `dc_runtime.zhonseyahndqlzoygolr`, TLS `verify-full` e CA local validada.
Não usar o `.env` original nem conexão local. Não compartilhar senha ou URL.

Em uma sessão psql já autenticada nesse destino e com TLS validado:

```psql
\conninfo
\i 'C:/Users/David Mangueira/OneDrive/Documentos/ChatGPT/DespachanteControl/database/postgresql/verification/hml-f42f-readonly.sql'
```

O arquivo ativa ON_ERROR_STOP, usa uma única transação READ ONLY, timeout local
de 15 segundos e termina com ROLLBACK. Se houver erro, parar e executar ROLLBACK
na sessão antes de qualquer outro comando. Não repetir automaticamente.
A consulta pg_stat_ssl examina o trecho servidor/pooler; a validação do hostname
do pooler depende da configuração verify-full do cliente.

O inventário mostra IDs, marcadores e vínculos; não consulta documentos,
contatos, senhas ou hashes. Prefixos literais são usados APENAS para descoberta,
com collation C (sem curingas LIKE). Marcadores não comprovam propriedade dos
dados: um registro renomeado pode ficar fora da seleção. Revisar também todos os
IDs não marcados e os vínculos em ambas as direções.

Esperado: 2 clientes, 2 veículos, 3 serviços, 3 despesas, 1 usuário (ID 1),
4 tipos; receita 500.52, custos 21.00, líquido 479.52 e 1 serviço em andamento.
Qualquer diferença exige revisão, nunca expansão automática da seleção.

## 2. Manifesto e condições obrigatórias

Registrar em manifesto privado os IDs reais de cada uma das quatro entidades,
seus marcadores completos e relacionamentos retornados pelo diagnóstico.
Confirmar individualmente que são fictícios TESTE_HML_F42F; não inferir IDs por
sequência, posição, data ou quantidade. Revisar FKs e triggers retornados:
as cinco FKs esperadas ligam veículo/cliente, serviço/cliente, serviço/veículo,
serviço/tipo e despesa/serviço. Triggers conhecidos de NFC devem ser comparados
com a migração 005. Dependências ou triggers inesperados bloqueiam a limpeza.

Exigir ausência de referências externas ao conjunto aprovado. Um veículo
externo de cliente selecionado, serviço externo de cliente/veículo selecionado
ou despesa externa de serviço selecionado bloqueia a operação. Referências
dos candidatos para clientes/veículos/serviços externos também exigem revisão.
Tipos de serviço são compartilhados e devem permanecer intocados.

Antes de escrever: obter nova autorização para o manifesto, manter backup
privado recuperável e interromper temporariamente as operações da aplicação.
Não salvar backup, saída do diagnóstico ou credenciais no repositório.

## 3. Operação transacional proposta (ainda não autorizada)

Usar conexão administrativa separada com TLS verify-full e confirmação do
projeto. `dc_runtime` não possui DELETE em Clientes, Veículos e Serviços;
não ampliar suas permissões. Usar o acesso administrativo existente para
`SET LOCAL ROLE dc_migrator`. Não executar bootstrap ou migrações.

O script final será preparado com o manifesto revisado, nesta ordem:

1. ON_ERROR_STOP; BEGIN; SET LOCAL ROLE dc_migrator; timeout de 15s e
   lock_timeout de 5s, somente na transação.
2. Bloquear as seis tabelas em ordem fixa (cliente, veiculo, servico,
   despesa_servico, tipo_servico, usuario), em SHARE ROW EXCLUSIVE, antes de
   conferir o manifesto. Isso impede alterações concorrentes durante as
   verificações e preserva consultas normais. Se não obtiver os locks, abortar.
3. Conferir novamente identidade, IDs, marcadores completos, vínculos,
   quantidades e valores exatos NUMERIC. Capturar em memória da transação
   snapshots das linhas preservadas, inclusive usuário 1 e tipos, sem imprimir
   conteúdo sensível. Conferir novamente FKs e triggers. Qualquer divergência
   deve causar RAISE EXCEPTION e rollback integral.
4. DELETE por listas explícitas de IDs aprovados: despesas → serviços →
   veículos → clientes. Conferir ROW_COUNT esperado (3, 3, 2, 2) e retornar
   somente os IDs excluídos. Nunca selecionar para exclusão por prefixo.
5. Confirmar ausência de todos os IDs do manifesto e igualdade dos snapshots
   preservados. Se o diagnóstico confirmar que todos os registros de negócio
   eram estes testes, exigir quatro tabelas vazias e Dashboard zerado. Caso
   existam registros externos, interromper e revisar os resultados esperados
   antes de autorizar; não exigir nem produzir esvaziamento indiscriminado.
6. COMMIT somente após todas as asserções e autorização específica. Qualquer
   erro: ROLLBACK. Perda de conexão durante COMMIT: consultar o estado antes
   de decidir qualquer ação; nunca repetir automaticamente.
7. Em nova transação de leitura, repetir o diagnóstico e confirmar usuário 1,
   quatro tipos, objetos e histórico de migrações preservados.

Não usar TRUNCATE, CASCADE, reset de sequências ou DDL. Lacunas nos IDs após a
limpeza são esperadas. Nenhuma conta, role, schema, View, função, migração ou
sequência será removida.

## Script preparado para revisão — NÃO EXECUTAR AINDA

Arquivo: `cleanup-hml-f42f.psql`. Exige uma nova autorização antes da execução.
Contém as quatro listas explícitas confirmadas. Confere novamente o inventário
integral, marcadores completos do roteiro, vínculos, FKs, ausência de triggers
ou rules de DELETE inesperadas, valores financeiros e preservação integral
das linhas de usuários, tipos e histórico de migrações. Os snapshots ficam
em variáveis internas e nunca são impressos.

O manifesto foi confirmado individualmente: cliente 1 = CLIENTE_A_EDITADO,
cliente 3 = EMPRESA_B; veículo 1 = V1/proprietário 1, veículo 2 = V2/proprietário 3;
serviço 1 = S1/cliente 3/veículo 1/EM_ANDAMENTO/150.01, serviço 2 =
S2/cliente 1/veículo 2/CONCLUIDO/350.51, serviço 3 =
S3/cliente 1/veículo 1/CANCELADO/0.00; despesas 1 = D1/serviço 1/10.02,
2 = D2/serviço 1/5.98 e 3 = D3/serviço 3/5.00.
Todos os marcadores têm prefixo literal TESTE_HML_F42F_. Cada ID é conferido
junto de todos esses atributos antes do primeiro DELETE. Texto usa collation C
e valores usam NUMERIC; valores ausentes também interrompem a operação.

Depois de autorização explícita, suspender escritas na aplicação e usar um
processo psql novo, exclusivamente para este arquivo. Comando PowerShell
reservado para essa etapa futura (senha administrativa digitada no prompt):

```powershell
# Abort rather than silently inherit libpq connection options. Prints no values.
if (@(Get-ChildItem Env: | Where-Object Name -Like 'PG*').Count -ne 0) {
    throw 'Use a fresh terminal without PG environment overrides; review privately.'
}
if (-not (Test-Path -LiteralPath 'C:/Users/David Mangueira/supabase/prod-ca-2021.crt' -PathType Leaf)) {
    throw 'CA certificate file missing.'
}
psql -X -W --dbname="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.zhonseyahndqlzoygolr sslmode=verify-full sslrootcert='C:/Users/David Mangueira/supabase/prod-ca-2021.crt' connect_timeout=15" -v ON_ERROR_STOP=1 -f 'C:/Users/David Mangueira/OneDrive/Documentos/ChatGPT/DespachanteControl/database/postgresql/deployment/cleanup-hml-f42f.psql'
if ($LASTEXITCODE -ne 0) { throw 'Cleanup failed; inspect using read-only diagnostics. Do not retry.' }
```

O script compara HOST, PORT, DBNAME e USER da conexão psql com esses valores
e solicita `DELETE_TESTE_HML_F42F_10_ROWS`. O banco sozinho não identifica o
projeto: a identidade do tenant depende também do usuário com referência do
projeto no Session pooler, do host validado via TLS e da conferência no painel.
Não executar por outra ferramenta, por fragmentos ou em uma sessão existente.
O arquivo SQL não consegue provar a validação TLS do trecho cliente/pooler;
o comando acima a exige explicitamente. Não remover esses parâmetros.
As variáveis especiais do psql são uma conferência adicional, não prova isolada:
elas podem ser sobrescritas por comandos do cliente. A garantia é composta pelo
processo novo com `-X`, conexão explícita autenticada, validação do certificado e
hostname, usuário de pooler com referência HML e identidade verificada no servidor.
O comando não usa `-v HOST/USER` nem strings vindas de `.env`. A guarda rejeita
overrides PG herdados (inclusive PGHOSTADDR, PGSERVICE e PGOPTIONS), sem imprimir
seus valores ou alterar o ambiente. `\conninfo` mostra a conexão efetiva sem senha.
Não concluir que `current_database=postgres` ou SSL ativo identificam o projeto.

Após a confirmação textual, não há outra pausa: o COMMIT é automático SOMENTE
se todas as verificações passarem. Antes disso, uma exceção aborta a transação;
ON_ERROR_STOP encerra o processo e o fechamento da conexão desfaz as exclusões.
Rejeição do destino ou da confirmação gera RAISE EXCEPTION antes de BEGIN:
com ON_ERROR_STOP e execução por arquivo, o psql encerra com código 3.
Esses caminhos não executam escrita. Não considerar apenas o exit
code suficiente: exigir a mensagem `Cleanup committed` e conferir em nova
conexão de leitura. Se houver desconexão durante COMMIT, o resultado pode ser
incerto; não repetir. Fazer primeiro o diagnóstico somente de leitura.

Riscos: operação definitiva após COMMIT, bloqueio breve das escritas concorrentes,
timeout se houver outra transação e marcadores divergentes. Manter backup
privado recuperável antes de autorizar. Não executar DDL administrativo em
paralelo. O script não reinicia sequências; os próximos IDs terão lacunas.

## Backup recuperável obrigatório antes da exclusão (não executado)

1. Usar ferramentas PostgreSQL 17 atualizadas, confirmar versões de `pg_dump`
   e `pg_restore`, manter a aplicação sem escritas até terminar backup e limpeza.
   Confirmar novamente o projeto no painel. Não usar o banco local existente.
2. Preparar uma pasta privada fora do Git e OneDrive, por exemplo
   `C:/Users/David Mangueira/supabase/backups`, com acesso restrito e disco
   criptografado. O arquivo conterá o hash do usuário 1 e deve ser protegido;
   formato custom/compressão NÃO é criptografia. Não abrir o conteúdo no chat.
3. Após autorização separada para o backup de leitura, executar o bloco abaixo.
   Não sobrescrever um backup anterior; senha só no prompt. Parar em qualquer
   erro ou aviso inesperado. Nenhum comando abaixo foi executado nesta revisão.

```powershell
if (@(Get-ChildItem Env: | Where-Object Name -Like 'PG*').Count -ne 0) {
    throw 'Review inherited PG settings privately before proceeding.'
}
$backup = 'C:/Users/David Mangueira/supabase/backups/hml-before-f42f-cleanup.dump'
if (Test-Path -LiteralPath $backup) { throw 'Backup already exists; preserve it.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $backup) -PathType Container)) {
    throw 'Prepare the private backup directory first.'
}
pg_dump -W --dbname="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.zhonseyahndqlzoygolr sslmode=verify-full sslrootcert='C:/Users/David Mangueira/supabase/prod-ca-2021.crt' connect_timeout=15" --role=dc_migrator --format=custom --schema=app --schema=dc_migrations --file=$backup
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; no cleanup permitted.' }
pg_restore --list $backup | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unreadable archive; no cleanup permitted.' }
Get-FileHash -LiteralPath $backup -Algorithm SHA256
```

4. `--list` e SHA256 não comprovam restauração. Antes de excluir, ensaiar uma
   restauração completa em PostgreSQL 17 descartável, isolado e vazio, com ICU,
   UTF8 e pré-requisitos da aplicação. Provisionar apenas nesse ambiente os
   papéis NOLOGIN dc_migrator e dc_api exigidos pelas ACLs. Não executar apply.psql
   antes da restauração: o arquivo já contém os schemas, estrutura e dados.
   Papéis globais não fazem parte deste backup; guardar também os scripts e
   versões necessários. Backup por schema não inclui dependências externas
   automaticamente, nem representa um backup completo dos serviços Supabase.
5. Com destino descartável previamente verificado e autorização específica,
   restaurar com `pg_restore --exit-on-error --single-transaction --dbname=<CONEXAO_DESCARTAVEL_VERIFICADA_SEM_SENHA> <ARQUIVO_BACKUP>`.
   Os placeholders são intencionais: não há um destino local presumido.
   Não usar `--clean`, não apontar esse comando ao HML nem aos bancos locais
   existentes. A restauração deve passar sem erros de roles, ownership ou ACLs.
6. No banco restaurado, verificar os dez registros e atributos do manifesto,
   totais 500.52/21.00/479.52, usuário 1, quatro tipos, cinco migrações, FKs,
   Views, função financeira e integridade das sequências. Não imprimir hashes.
   Só considerar o backup recuperável após esse ensaio.
7. Se uma recuperação real for necessária, parar a aplicação e preparar uma
   operação separada revisada. Nunca restaurar indiscriminadamente sobre HML:
   usuário 1 e tipos permanecem lá. Preferir recuperar em destino separado e
   planejar a reinserção seletiva dos dez registros, preservando conta, tipos e
   estrutura. Não há restauração automática nesta etapa.

Referências oficiais: [parâmetros libpq e TLS](https://www.postgresql.org/docs/17/libpq-connect.html),
[backup com pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

## Validação desta preparação

Revisão estática local dos arquivos; o diagnóstico remoto foi executado pelo
usuário. O script de exclusão NÃO foi executado nem validado contra banco real
nesta preparação. A limpeza continua bloqueada até a revisão dos marcadores,
do script e a autorização explícita do usuário.
