import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startCluster } from './cluster.mjs';
import { migrate } from './migrate.mjs';

let cluster;
before(async () => {
  cluster = await startCluster();
  console.log('PostgreSQL descartável:', await cluster.sql('SHOW server_version;'));
  // Inventory must also work before app/roles exist; never contacts Supabase.
  await cluster.sql(await readFile(new URL('../verification/supabase-preflight.sql', import.meta.url), 'utf8'));
  await cluster.sql(await readFile(new URL('../bootstrap.sql', import.meta.url), 'utf8'));
  await migrate(cluster.sql);
});
after(async () => { if (cluster) await cluster.stop(); });

const helpers = `
CREATE FUNCTION pg_temp.ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.fails(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
    IF actual = expected THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected SQLSTATE %, received %', expected, actual;
  END;
  RAISE EXCEPTION 'Statement unexpectedly succeeded; expected %', expected;
END $$;`;
const run = body => cluster.sql(`BEGIN; SET LOCAL ROLE dc_migrator; ${helpers}\n${body}\nROLLBACK;`);
test('preflight Supabase é somente leitura e funciona após migrações', async () => {
  const source = await readFile(new URL('../verification/supabase-preflight.sql', import.meta.url), 'utf8');
  assert.match(source, /BEGIN READ ONLY;/);
  await cluster.sql(source);
  assert.equal(await cluster.sql('SELECT count(*) FROM dc_migrations.history;'), '6');
});
const fixtures = `
INSERT INTO app.cliente (tipo_pessoa,nome_razao_social,cpf_cnpj,telefone)
VALUES ('PF','Proprietário sintético','00000000001','000'), ('PJ','Solicitante sintético','00000000000002','000');
INSERT INTO app.veiculo (id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,renavam)
SELECT id_cliente,'TST1A23','Automóvel','Teste','Sintético','00000000001' FROM app.cliente WHERE cpf_cnpj='00000000001';
INSERT INTO app.servico (id_cliente,id_veiculo,id_tipo_servico,data_inicio,valor_recebido)
SELECT c.id_cliente,v.id_veiculo,t.id_tipo_servico,app.parse_timestamp('2026-10-26T00:00:00.123456'),150.01
FROM app.cliente c CROSS JOIN app.veiculo v CROSS JOIN app.tipo_servico t
WHERE c.cpf_cnpj='00000000000002' AND t.nome='Transferência';`;

test('migrações versionadas reaplicam sem duplicar; seis tabelas de negócio e seed limpo', async () => {
  await migrate(cluster.sql);
  assert.equal(await cluster.sql('SELECT count(*) FROM dc_migrations.history;'), '6');
  await run(`
    SELECT pg_temp.ok((SELECT count(*)=6 FROM information_schema.tables WHERE table_schema='app' AND table_type='BASE TABLE'), 'six tables');
    SELECT pg_temp.ok((SELECT count(*)=4 FROM app.tipo_servico), 'four service types');
    SELECT pg_temp.ok((SELECT count(*)=0 FROM app.usuario), 'no initial user created');
    SELECT pg_temp.ok((SELECT count(*)=0 FROM app.cliente), 'no customer imported');
    SELECT pg_temp.ok((SELECT count(*)=0 FROM app.servico), 'no service imported');
    SELECT pg_temp.ok((SELECT count(*)=3 FROM pg_indexes WHERE schemaname='app' AND indexname LIKE 'ix_%'), 'three original indexes');
  `);
});

test('seed é idempotente mesmo quando executado diretamente', async () => {
  const seed = await readFile(new URL('../migrations/003_tipos_servico.sql', import.meta.url), 'utf8');
  await run(`${seed}\n${seed}\nSELECT pg_temp.ok((SELECT count(*)=4 FROM app.tipo_servico), 'idempotent seed');`);
});

test('histórico recusa alteração de checksum de migração aplicada', async () => {
  const old = await cluster.sql("SELECT checksum FROM dc_migrations.history WHERE version='001_schema.sql';");
  assert.match(old, /^[a-f0-9]{64}$/);
  await cluster.sql("UPDATE dc_migrations.history SET checksum='modified' WHERE version='001_schema.sql';");
  try { await assert.rejects(migrate(cluster.sql), /checksum mismatch/); }
  finally { await cluster.sql(`UPDATE dc_migrations.history SET checksum='${old}' WHERE version='001_schema.sql';`); }
});

test('NFC explícito: chaves canônicas iguais sem remover acento, caixa de exibição ou espaços', async () => {
  await run(`
    SELECT pg_temp.ok(app.text_key(U&'Jos\\00e9') COLLATE "C" = app.text_key(U&'Jose\\0301'), 'canonical key bytes');
    SELECT pg_temp.ok(app.text_key(U&'Jose\\0301') IS NFC NORMALIZED, 'NFC key');
    SELECT pg_temp.ok(app.text_key('José') COLLATE app.ci_as <> app.text_key('Jose'), 'accent retained');
    INSERT INTO app.tipo_servico(nome,descricao) VALUES (U&' Jose\\0301 ',U&'\\ff21');
    SELECT pg_temp.ok((SELECT nome COLLATE "C" = ' José ' AND descricao COLLATE "C" = U&'\\ff21' FROM app.tipo_servico WHERE nome=' José '), 'display preserves spaces/case and NFC is not NFKC');
  `);
});

test('NFC/NFD: duplicidade, consulta equivalente, edição própria e colisão de atualização', async () => {
  await run(`
    INSERT INTO app.usuario(nome,email,senha_hash) VALUES (U&'Jose\\0301',U&'jose\\0301@example.invalid','not-a-login-hash');
    SELECT pg_temp.ok((SELECT nome COLLATE "C" = 'José' AND email COLLATE "C" = 'josé@example.invalid' FROM app.usuario), 'NFD stored NFC');
    SELECT pg_temp.ok((SELECT count(*)=1 FROM app.usuario WHERE app.text_key(email) COLLATE app.ci_as=app.text_key(U&'JOSE\\0301@example.invalid ')), 'NFD parameter finds NFC row');
    SELECT pg_temp.fails($q$INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Outro','JOSÉ@example.invalid ','not-a-login-hash')$q$,'23505');
    UPDATE app.usuario SET email=U&'JOSE\\0301@example.invalid';
    INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Sem acento','jose@example.invalid','not-a-login-hash');
    SELECT pg_temp.fails($q$UPDATE app.usuario SET email=U&'jose\\0301@example.invalid' WHERE email='jose@example.invalid'$q$,'23505');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES (U&'Transfere\\0302ncia')$q$,'23505');
  `);
});

test('NFC: INSERT/UPDATE nas seis tabelas, null preservado e hash byte-exato', async () => {
  await run(`${fixtures}
    UPDATE app.cliente SET nome_razao_social=U&'Jose\\0301',email=U&'jose\\0301@example.invalid';
    UPDATE app.veiculo SET marca=U&'Citroe\\0308n',modelo=U&'Vei\\0301culo',tipo_veiculo=U&'Automo\\0301vel';
    UPDATE app.servico SET observacoes=U&'Observac\\0327a\\0303o';
    UPDATE app.tipo_servico SET descricao=U&'Descric\\0327a\\0303o';
    INSERT INTO app.usuario(nome,email,senha_hash) VALUES (U&'Jose\\0301','teste@example.invalid',U&'e\\0301');
    UPDATE app.usuario SET nome=U&'Joa\\0303o';
    INSERT INTO app.despesa_servico(id_servico,descricao,valor,observacoes)
      SELECT id_servico,U&'Descric\\0327a\\0303o',10.02,NULL FROM app.servico;
    UPDATE app.despesa_servico SET descricao=U&'Revisa\\0303o',observacoes=U&'Observac\\0327a\\0303o';
    SELECT pg_temp.ok((SELECT bool_and(nome_razao_social IS NFC NORMALIZED AND email IS NFC NORMALIZED) FROM app.cliente),'cliente');
    SELECT pg_temp.ok((SELECT marca IS NFC NORMALIZED AND modelo IS NFC NORMALIZED AND tipo_veiculo IS NFC NORMALIZED FROM app.veiculo),'veiculo');
    SELECT pg_temp.ok((SELECT observacoes IS NFC NORMALIZED FROM app.servico),'servico');
    SELECT pg_temp.ok((SELECT bool_and(descricao IS NFC NORMALIZED) FROM app.tipo_servico),'tipo');
    SELECT pg_temp.ok((SELECT nome COLLATE "C"='João' AND senha_hash COLLATE "C"=U&'e\\0301' FROM app.usuario),'hash excluded');
    SELECT pg_temp.ok((SELECT descricao COLLATE "C"='Revisão' AND observacoes IS NFC NORMALIZED FROM app.despesa_servico),'despesa');
    UPDATE app.despesa_servico SET observacoes=NULL;
    SELECT pg_temp.ok((SELECT observacoes IS NULL AND valor=10.02 FROM app.despesa_servico),'null and amount');
    SELECT pg_temp.ok((SELECT cliente COLLATE "C"='José' AND custo_total=10.02 AND resultado_liquido=139.99 FROM app.vw_resumo_financeiro_servico),'financial projection');
  `);
});

test('NFC: adaptador precisa normalizar antes do limite varchar e não pode truncar', async () => {
  await run(`
    INSERT INTO app.tipo_servico(nome) VALUES (normalize(repeat(U&'e\\0301',100),NFC));
    SELECT pg_temp.ok((SELECT char_length(nome)=100 AND nome IS NFC NORMALIZED FROM app.tipo_servico WHERE nome=repeat('é',100)),'normalized limit');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES (repeat(U&'e\\0301',100))$q$,'22001');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES (repeat('é',101))$q$,'22001');
  `);
});

test('NFC: API normaliza por trigger sem receber DDL ou permissão de criar triggers', async () => {
  await run(`${fixtures}
    SET LOCAL ROLE dc_api;
    UPDATE app.cliente SET nome_razao_social=U&'Joa\\0303o';
    SELECT pg_temp.ok((SELECT bool_and(nome_razao_social COLLATE "C"='João') FROM app.cliente),'API trigger execution');
    SELECT pg_temp.ok(NOT has_function_privilege('dc_api','app.normalize_text_nfc()','EXECUTE'),'no new execute grant');
    SELECT pg_temp.fails($q$ALTER TABLE app.cliente DISABLE TRIGGER cliente_text_nfc$q$,'42501');
  `);
});

test('collation: caixa, acentos, espaços e expansões observadas no SQL Server', async () => {
  await run(`
    SELECT pg_temp.ok('A' COLLATE app.ci_as = 'a', 'case insensitive');
    SELECT pg_temp.ok('Jose' COLLATE app.ci_as <> 'José', 'accent sensitive');
    SELECT pg_temp.ok(app.text_key('abc ') COLLATE app.ci_as = app.text_key('ABC'), 'trailing spaces');
    SELECT pg_temp.ok(app.text_key('Straße') COLLATE app.ci_as = app.text_key('STRASSE'), 'sharp s');
    SELECT pg_temp.ok(app.text_key('Æ') COLLATE app.ci_as = app.text_key('ae'), 'ligature');
    SELECT pg_temp.ok('a-b' COLLATE app.ci_as <> 'ab', 'punctuation');
    INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Sintético','TEST@example.invalid','not-a-login-hash');
    SELECT pg_temp.fails($q$INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Sintético','test@example.invalid ','not-a-login-hash')$q$, '23505');
    INSERT INTO app.tipo_servico(nome) VALUES ('José');
    INSERT INTO app.tipo_servico(nome) VALUES ('Jose');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES ('JOSÉ ')$q$, '23505');
    INSERT INTO app.tipo_servico(nome) VALUES ('Straße');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES ('STRASSE')$q$, '23505');
  `);
});

test('FKs, NOT NULL, PF/PJ, UNIQUE e ausência de cascata', async () => {
  await run(`${fixtures}
    SELECT pg_temp.fails($q$INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone) VALUES ('XX','Teste','123','000')$q$, '23514');
    SELECT pg_temp.fails($q$INSERT INTO app.cliente(tipo_pessoa,cpf_cnpj,telefone) VALUES ('PF','123','000')$q$, '23502');
    SELECT pg_temp.fails($q$INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone) VALUES ('PF','Teste','00000000001','000')$q$, '23505');
    SELECT pg_temp.fails($q$UPDATE app.veiculo SET id_cliente_proprietario=2147483647$q$, '23503');
    SELECT pg_temp.fails($q$UPDATE app.servico SET id_cliente=2147483647$q$, '23503');
    SELECT pg_temp.fails($q$UPDATE app.servico SET id_veiculo=2147483647$q$, '23503');
    SELECT pg_temp.fails($q$UPDATE app.servico SET id_tipo_servico=2147483647$q$, '23503');
    SELECT pg_temp.fails($q$INSERT INTO app.despesa_servico(id_servico,descricao,valor) VALUES (2147483647,'Teste',1)$q$, '23503');
    SELECT pg_temp.fails($q$DELETE FROM app.cliente$q$, '23503');
    SELECT pg_temp.ok((SELECT s.id_cliente <> v.id_cliente_proprietario FROM app.servico s JOIN app.veiculo v USING(id_veiculo)), 'requester differs from owner');
  `);
});

test('veículo: placa e RENAVAM únicos, edição própria e zeros preservados', async () => {
  await run(`${fixtures}
    SELECT pg_temp.fails($q$INSERT INTO app.veiculo(id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,renavam)
      SELECT id_cliente_proprietario,'tst1a23',tipo_veiculo,marca,modelo,'00000000002' FROM app.veiculo$q$, '23505');
    SELECT pg_temp.fails($q$INSERT INTO app.veiculo(id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,renavam)
      SELECT id_cliente_proprietario,'TST9B99',tipo_veiculo,marca,modelo,renavam FROM app.veiculo$q$, '23505');
    UPDATE app.veiculo SET placa=placa,renavam=renavam;
    SELECT pg_temp.ok((SELECT renavam='00000000001' FROM app.veiculo), 'leading zeros');
  `);
});

test('UNIQUE arbitra transações concorrentes NFC/NFD no banco real descartável', async () => {
  const statement = email => `\\set VERBOSITY sqlstate
    BEGIN; SET LOCAL ROLE dc_migrator;
    INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Concorrência sintética',${email},'not-a-login-hash');
    SELECT pg_sleep(0.2); COMMIT;`;
  try {
    const results = await Promise.allSettled([
      cluster.sql(statement("'josé-race@example.invalid'")),
      cluster.sql(statement("U&'jose\\0301-race@example.invalid'")),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.match(rejected.reason.stderr, /23505/);
    assert.equal(await cluster.sql("SELECT count(*) FROM app.usuario WHERE email='josé-race@example.invalid';"), '1');
  } finally { await cluster.sql("DELETE FROM app.usuario WHERE email='josé-race@example.invalid';"); }
});

test('timestamp: seis casas exatas; sete casas, timezone e datas inválidas rejeitados', async () => {
  await run(`
    SELECT pg_temp.ok(to_char(app.parse_timestamp('2026-10-26T23:59:59.123456'),'YYYY-MM-DD"T"HH24:MI:SS.US')='2026-10-26T23:59:59.123456','six digits');
    SELECT pg_temp.ok(app.parse_timestamp('2024-02-29T00:00:00')::date='2024-02-29'::date,'leap day');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-10-26T00:00:00.1234567')$q$, '22007');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-10-26T00:00:00.1234560')$q$, '22007');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-10-26T00:00:00Z')$q$, '22007');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-10-26T00:00:00-03:00')$q$, '22007');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-02-30T00:00:00')$q$, '22008');
    SELECT pg_temp.fails($q$SELECT app.parse_timestamp('2026-10-26T24:00:00')$q$, '22007');
  `);
});

test('cadastro UTC preserva formatos públicos com e sem Z em fusos diferentes', async () => {
  const output = async zone => cluster.sql(`SET TIME ZONE '${zone}'; SELECT json_build_object(
    'date_json',to_char('2026-10-26T12:34:56.123Z'::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'service_json',to_char('2026-10-26T12:34:56.123Z'::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS'))::text;`);
  const expected = { date_json: '2026-10-26T12:34:56.123Z', service_json: '2026-10-26T12:34:56.123' };
  for (const zone of ['UTC','America/Fortaleza','Pacific/Auckland']) assert.deepEqual(JSON.parse(await output(zone)), expected);
  await run(`${fixtures}
    SELECT pg_temp.ok((SELECT pg_typeof(data_cadastro)::text='timestamp with time zone' FROM app.servico),'instant type');
    SELECT pg_temp.ok((SELECT data_cadastro BETWEEN now()-interval '1 minute' AND clock_timestamp() FROM app.servico),'default current instant');
  `);
});

test('serviços: status e datas, valor não negativo; despesas positivas em cancelados/concluídos', async () => {
  await run(`${fixtures}
    SELECT pg_temp.fails($q$UPDATE app.servico SET status='INVALIDO'$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.servico SET data_conclusao=app.parse_timestamp('2026-10-25T00:00:00')$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.servico SET valor_recebido=-0.01$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.servico SET valor_recebido='NaN'$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.servico SET valor_recebido=100000000.00$q$, '22003');
    UPDATE app.servico SET status='CONCLUIDO', data_conclusao=data_inicio,valor_recebido=0;
    INSERT INTO app.despesa_servico(id_servico,descricao,valor,data_despesa) SELECT id_servico,'Teste',1.01,'2024-02-29' FROM app.servico;
    UPDATE app.servico SET status='CANCELADO';
    INSERT INTO app.despesa_servico(id_servico,descricao,valor) SELECT id_servico,'Teste',2.02 FROM app.servico;
    SELECT pg_temp.fails($q$UPDATE app.despesa_servico SET valor=0$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.despesa_servico SET valor=-1$q$, '23514');
    SELECT pg_temp.fails($q$UPDATE app.despesa_servico SET valor='NaN'$q$, '23514');
    SELECT pg_temp.fails($q$DELETE FROM app.servico$q$, '23503');
  `);
});

test('financeiro vazio, sem despesas, centavos exatos e função inexistente', async () => {
  await run(`
    SELECT pg_temp.ok((SELECT receita_total=0 AND custos_totais=0 AND resultado_liquido=0 AND quantidade_servicos=0 AND servicos_em_andamento=0 FROM app.vw_dashboard_resumo),'empty dashboard');
    SELECT pg_temp.ok((SELECT count(*)=0 FROM app.resumo_financeiro_servico(2147483647)),'missing service');
    ${fixtures}
    SELECT pg_temp.ok((SELECT custo_total=0.00 AND resultado_liquido=150.01 FROM app.vw_resumo_financeiro_servico),'no expenses');
    INSERT INTO app.despesa_servico(id_servico,descricao,valor) SELECT id_servico,'Teste',10.02 FROM app.servico;
    SELECT pg_temp.ok((SELECT resultado_liquido=139.99 FROM app.vw_resumo_financeiro_servico),'exact cents');
    SELECT pg_temp.ok((SELECT f.resultado_liquido=139.99 FROM app.servico s CROSS JOIN LATERAL app.resumo_financeiro_servico(s.id_servico) f),'function');
  `);
});

test('financeiro: várias despesas não duplicam receita; cancelados participam; totais amplos', async () => {
  await run(`${fixtures}
    INSERT INTO app.despesa_servico(id_servico,descricao,valor) SELECT id_servico,'Um',10.02 FROM app.servico;
    INSERT INTO app.despesa_servico(id_servico,descricao,valor) SELECT id_servico,'Dois',200.03 FROM app.servico;
    UPDATE app.servico SET status='CANCELADO';
    SELECT pg_temp.ok((SELECT receita_total=150.01 AND custos_totais=210.05 AND resultado_liquido=-60.04 AND quantidade_servicos=1 AND servicos_em_andamento=0 FROM app.vw_dashboard_resumo),'cancelled totals');
    INSERT INTO app.servico(id_cliente,id_veiculo,id_tipo_servico,valor_recebido)
    SELECT id_cliente,id_veiculo,id_tipo_servico,99999999.99 FROM app.servico;
    SELECT pg_temp.ok((SELECT receita_total=100000150.00 AND resultado_liquido=99999939.95 AND servicos_em_andamento=1 FROM app.vw_dashboard_resumo),'aggregate exceeds column precision');
  `);
});

test('privilégios: API lê/grava negócio, exclui despesa, mas não administra usuários ou schema', async () => {
  await run(`${fixtures}
    SET LOCAL ROLE dc_api;
    SELECT pg_temp.ok((SELECT count(*)=1 FROM app.vw_resumo_financeiro_servico),'read invoker view');
    SELECT pg_temp.ok((SELECT count(*)=1 FROM app.resumo_financeiro_servico((SELECT id_servico FROM app.servico))),'execute function');
    INSERT INTO app.despesa_servico(id_servico,descricao,valor) SELECT id_servico,'Teste API',1.00 FROM app.servico;
    UPDATE app.despesa_servico SET valor=2.00;
    DELETE FROM app.despesa_servico;
    INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone) VALUES ('PF','Teste API','00000000003','000');
    UPDATE app.cliente SET telefone='001';
    SELECT pg_temp.fails($q$INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('Teste','api@example.invalid','invalid')$q$, '42501');
    SELECT pg_temp.fails($q$UPDATE app.usuario SET ativo=false$q$, '42501');
    SELECT pg_temp.fails($q$INSERT INTO app.tipo_servico(nome) VALUES ('Não permitido')$q$, '42501');
    SELECT pg_temp.fails($q$DELETE FROM app.cliente$q$, '42501');
    SELECT pg_temp.fails($q$DELETE FROM app.veiculo$q$, '42501');
    SELECT pg_temp.fails($q$DELETE FROM app.servico$q$, '42501');
    SELECT pg_temp.fails($q$CREATE TABLE app.forbidden(id int)$q$, '42501');
    SELECT pg_temp.fails($q$SELECT * FROM dc_migrations.history$q$, '42501');
  `);
});

test('schema privado: usuário sem grants não acessa tabelas, views ou funções', async () => {
  // New role belongs only to the disposable cluster, and is rolled back.
  await cluster.sql(`BEGIN; CREATE ROLE dc_test_outsider NOLOGIN; ${helpers}
    SET LOCAL ROLE dc_test_outsider;
    SELECT pg_temp.fails($q$SELECT * FROM app.cliente$q$, '42501');
    SELECT pg_temp.fails($q$SELECT * FROM app.vw_dashboard_resumo$q$, '42501');
    SELECT pg_temp.fails($q$SELECT * FROM app.resumo_financeiro_servico(1)$q$, '42501');
    ROLLBACK;`);
});
