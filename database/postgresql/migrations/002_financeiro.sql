CREATE VIEW app.vw_resumo_financeiro_servico WITH (security_invoker = true) AS
SELECT s.id_servico, c.nome_razao_social AS cliente, v.placa, ts.nome AS tipo_servico,
       s.status, s.data_inicio, s.data_conclusao, s.valor_recebido,
       COALESCE(SUM(d.valor), 0.00::numeric) AS custo_total,
       s.valor_recebido - COALESCE(SUM(d.valor), 0.00::numeric) AS resultado_liquido
FROM app.servico s
JOIN app.cliente c ON c.id_cliente = s.id_cliente
JOIN app.veiculo v ON v.id_veiculo = s.id_veiculo
JOIN app.tipo_servico ts ON ts.id_tipo_servico = s.id_tipo_servico
LEFT JOIN app.despesa_servico d ON d.id_servico = s.id_servico
GROUP BY s.id_servico, c.nome_razao_social, v.placa, ts.nome;

CREATE VIEW app.vw_dashboard_resumo WITH (security_invoker = true) AS
SELECT
  (SELECT COALESCE(SUM(valor_recebido), 0.00::numeric) FROM app.servico) AS receita_total,
  (SELECT COALESCE(SUM(valor), 0.00::numeric) FROM app.despesa_servico) AS custos_totais,
  (SELECT COALESCE(SUM(resultado_liquido), 0.00::numeric) FROM app.vw_resumo_financeiro_servico) AS resultado_liquido,
  (SELECT COUNT(*) FROM app.servico) AS quantidade_servicos,
  (SELECT COUNT(*) FROM app.servico WHERE app.text_key(status) COLLATE app.ci_as = 'EM_ANDAMENTO') AS servicos_em_andamento;

CREATE FUNCTION app.resumo_financeiro_servico(service_id integer)
RETURNS TABLE (id_servico integer, cliente varchar(150), placa varchar(7),
  tipo_servico varchar(100), status varchar(20), valor_recebido numeric,
  custo_total numeric, resultado_liquido numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT r.id_servico, r.cliente, r.placa, r.tipo_servico, r.status,
         r.valor_recebido, r.custo_total, r.resultado_liquido
  FROM app.vw_resumo_financeiro_servico r WHERE r.id_servico = service_id
$$;
