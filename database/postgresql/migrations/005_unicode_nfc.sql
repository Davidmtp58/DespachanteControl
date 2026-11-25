-- Stage 2.1: canonical Unicode equivalence is intentional for the NEW database.
-- Do not emulate lossy conversions through the SQL Server legacy code page.
CREATE OR REPLACE FUNCTION app.text_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT replace(replace(lower(rtrim(normalize(value, NFC), ' ') COLLATE app.ci_as) COLLATE "C", 'ß', 'ss'), 'æ', 'ae') COLLATE app.ci_as $$;

-- Function-backed index keys must be rebuilt when the function changes.
-- Do not silently merge any conflicting rows: a conflict aborts the migration.
REINDEX INDEX app.uq_cliente_cpf_cnpj;
REINDEX INDEX app.uq_usuario_email;
REINDEX INDEX app.uq_veiculo_placa;
REINDEX INDEX app.uq_veiculo_renavam;
REINDEX INDEX app.uq_tipo_servico_nome;

CREATE FUNCTION app.normalize_text_nfc() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  field_name text;
  normalized jsonb := '{}'::jsonb;
BEGIN
  -- Only the fixed column allowlists defined in the six triggers below are used.
  -- No dynamic SQL, no trimming/case folding and no modification of other fields.
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    normalized := normalized || jsonb_build_object(field_name, normalize(to_jsonb(NEW)->>field_name, NFC));
  END LOOP;
  NEW := jsonb_populate_record(NEW, normalized);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.normalize_text_nfc() FROM PUBLIC;

CREATE TRIGGER cliente_text_nfc BEFORE INSERT OR UPDATE ON app.cliente
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('tipo_pessoa','nome_razao_social','cpf_cnpj','telefone','email');
CREATE TRIGGER usuario_text_nfc BEFORE INSERT OR UPDATE ON app.usuario
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('nome','email');
CREATE TRIGGER veiculo_text_nfc BEFORE INSERT OR UPDATE ON app.veiculo
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('placa','tipo_veiculo','marca','modelo','renavam');
CREATE TRIGGER tipo_servico_text_nfc BEFORE INSERT OR UPDATE ON app.tipo_servico
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('nome','descricao');
CREATE TRIGGER servico_text_nfc BEFORE INSERT OR UPDATE ON app.servico
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('status','observacoes');
CREATE TRIGGER despesa_text_nfc BEFORE INSERT OR UPDATE ON app.despesa_servico
FOR EACH ROW EXECUTE FUNCTION app.normalize_text_nfc('descricao','observacoes');

-- No backfill: this migration targets the new database with its NFC service seed.
-- Password/hash/token normalization is deliberately outside this policy.
