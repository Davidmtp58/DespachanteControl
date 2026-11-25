-- Discovery only. Candidate markers are NOT authorization to delete.
-- Run with psql -X -v ON_ERROR_STOP=1 and client TLS verify-full.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT current_database() AS database_name, current_user, session_user,
       current_setting('server_version') AS version,
       current_setting('transaction_read_only') AS read_only;
-- Server-side TLS does not prove client-to-pooler hostname verification.
SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();

WITH
c AS (SELECT id_cliente AS id, nome_razao_social AS marker FROM app.cliente
      WHERE starts_with(nome_razao_social COLLATE "C", 'TESTE_HML_F42F_')),
v AS (SELECT id_veiculo AS id, modelo AS marker FROM app.veiculo
      WHERE starts_with(modelo COLLATE "C", 'TESTE_HML_F42F_')),
s AS (SELECT id_servico AS id, observacoes AS marker FROM app.servico
      WHERE starts_with(observacoes COLLATE "C", 'TESTE_HML_F42F_')),
d AS (SELECT id_despesa AS id, descricao AS marker FROM app.despesa_servico
      WHERE starts_with(descricao COLLATE "C", 'TESTE_HML_F42F_')),
records AS (
 SELECT 'cliente' AS entity, id, marker, '{}'::jsonb AS details FROM c
 UNION ALL SELECT 'veiculo', v.id, marker,
   jsonb_build_object('id_cliente_proprietario', x.id_cliente_proprietario)
   FROM v JOIN app.veiculo x ON x.id_veiculo = v.id
 UNION ALL SELECT 'servico', s.id, marker,
   jsonb_build_object('id_cliente', x.id_cliente, 'id_veiculo', x.id_veiculo,
     'id_tipo_servico', x.id_tipo_servico, 'status', x.status,
     'valor_recebido', x.valor_recebido::text)
   FROM s JOIN app.servico x ON x.id_servico = s.id
 UNION ALL SELECT 'despesa', d.id, marker,
   jsonb_build_object('id_servico', x.id_servico, 'valor', x.valor::text)
   FROM d JOIN app.despesa_servico x ON x.id_despesa = d.id
), edges AS (
 SELECT 'veiculo -> cliente' AS relationship, id_veiculo AS child_id,
   id_cliente_proprietario AS parent_id,
   id_veiculo IN (SELECT id FROM v) AS child_candidate,
   id_cliente_proprietario IN (SELECT id FROM c) AS parent_candidate FROM app.veiculo
 UNION ALL SELECT 'servico -> cliente', id_servico, id_cliente,
   id_servico IN (SELECT id FROM s), id_cliente IN (SELECT id FROM c) FROM app.servico
 UNION ALL SELECT 'servico -> veiculo', id_servico, id_veiculo,
   id_servico IN (SELECT id FROM s), id_veiculo IN (SELECT id FROM v) FROM app.servico
 UNION ALL SELECT 'despesa -> servico', id_despesa, id_servico,
   id_despesa IN (SELECT id FROM d), id_servico IN (SELECT id FROM s) FROM app.despesa_servico
), unmarked AS (
 SELECT 'cliente' AS entity, id_cliente AS id FROM app.cliente WHERE id_cliente NOT IN (SELECT id FROM c)
 UNION ALL SELECT 'veiculo', id_veiculo FROM app.veiculo WHERE id_veiculo NOT IN (SELECT id FROM v)
 UNION ALL SELECT 'servico', id_servico FROM app.servico WHERE id_servico NOT IN (SELECT id FROM s)
 UNION ALL SELECT 'despesa', id_despesa FROM app.despesa_servico WHERE id_despesa NOT IN (SELECT id FROM d)
)
SELECT jsonb_pretty(jsonb_build_object(
 'candidates', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY entity, id) FROM records r), '[]'::jsonb),
 'cross_boundary_dependencies', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY relationship, child_id)
    FROM edges e WHERE child_candidate <> parent_candidate), '[]'::jsonb),
 'unmarked_ids_review_required', COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY entity, id) FROM unmarked u), '[]'::jsonb)
)) AS inventory;

SELECT (SELECT count(*) FROM app.cliente) AS clientes,
       (SELECT count(*) FROM app.veiculo) AS veiculos,
       (SELECT count(*) FROM app.servico) AS servicos,
       (SELECT count(*) FROM app.despesa_servico) AS despesas,
       (SELECT count(*) FROM app.usuario) AS usuarios,
       (SELECT count(*) FROM app.usuario WHERE id_usuario = 1) AS usuario_1,
       (SELECT count(*) FROM app.tipo_servico) AS tipos_servico;
SELECT id_tipo_servico, nome, ativo FROM app.tipo_servico ORDER BY id_tipo_servico;
SELECT * FROM app.vw_dashboard_resumo;
-- Inventory every inbound/outbound FK, including unexpected referencing tables.
SELECT conname, conrelid::regclass AS child_table, confrelid::regclass AS parent_table,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype = 'f' AND
 (conrelid IN ('app.cliente'::regclass, 'app.veiculo'::regclass, 'app.servico'::regclass, 'app.despesa_servico'::regclass)
 OR confrelid IN ('app.cliente'::regclass, 'app.veiculo'::regclass, 'app.servico'::regclass, 'app.despesa_servico'::regclass))
ORDER BY conrelid::regclass::text, conname;
SELECT tgrelid::regclass AS table_name, tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
 ('app.cliente'::regclass, 'app.veiculo'::regclass, 'app.servico'::regclass, 'app.despesa_servico'::regclass)
ORDER BY tgrelid::regclass::text, tgname;
ROLLBACK;
