REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
-- No grants to Supabase anon/authenticated/service_role. Future project must keep
-- app outside exposed schemas and disable Data API if it is not used.
GRANT USAGE ON SCHEMA app TO dc_api;
GRANT SELECT, INSERT, UPDATE ON app.cliente, app.veiculo, app.servico TO dc_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.despesa_servico TO dc_api;
GRANT SELECT ON app.usuario, app.tipo_servico, app.vw_resumo_financeiro_servico, app.vw_dashboard_resumo TO dc_api;
GRANT USAGE ON SEQUENCE app.cliente_id_cliente_seq, app.veiculo_id_veiculo_seq,
  app.servico_id_servico_seq, app.despesa_servico_id_despesa_seq TO dc_api;
GRANT EXECUTE ON FUNCTION app.text_key(text), app.parse_timestamp(text), app.resumo_financeiro_servico(integer) TO dc_api;
