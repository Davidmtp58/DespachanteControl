CREATE SCHEMA app AUTHORIZATION dc_migrator;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;

-- Observed SQL Server: Latin1_General_CI_AS. ICU is a compatibility candidate,
-- not a claim of identical ordering over all Unicode. See README compatibility gate.
CREATE COLLATION app.ci_as (
  provider = icu, locale = 'und-u-ks-level2', deterministic = false
);

-- SQL Server equality ignores trailing U+0020 spaces. Use this key for equality
-- searches as well as UNIQUE expression indexes. Stored display text is unchanged.
CREATE FUNCTION app.text_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT replace(replace(lower(rtrim(value, ' ') COLLATE app.ci_as) COLLATE "C", 'ß', 'ss'), 'æ', 'ae') COLLATE app.ci_as $$;

-- PostgreSQL casts round excessive fractional digits BEFORE a CHECK/trigger can
-- inspect them. The future adapter MUST bind original input as text to this parser.
CREATE FUNCTION app.parse_timestamp(value text) RETURNS timestamp(6)
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog
AS $$
BEGIN
  IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?$'
     OR substring(value, 1, 4) = '0000'
     OR substring(value, 12, 2)::int > 23
     OR substring(value, 15, 2)::int > 59
     OR substring(value, 18, 2)::int > 59 THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'Timestamp requires ISO local format and at most six fractional digits.';
  END IF;
  RETURN value::timestamp(6);
END $$;

CREATE TABLE app.cliente (
  id_cliente integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_pessoa varchar(2) COLLATE app.ci_as NOT NULL,
  nome_razao_social varchar(150) COLLATE app.ci_as NOT NULL,
  cpf_cnpj varchar(14) COLLATE app.ci_as NOT NULL,
  telefone varchar(20) COLLATE app.ci_as NOT NULL,
  email varchar(150) COLLATE app.ci_as,
  data_nascimento date,
  data_cadastro timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_cliente_tipo_pessoa CHECK (tipo_pessoa IN ('PF', 'PJ'))
);
CREATE UNIQUE INDEX uq_cliente_cpf_cnpj ON app.cliente ((app.text_key(cpf_cnpj) COLLATE app.ci_as));

CREATE TABLE app.usuario (
  id_usuario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome varchar(120) COLLATE app.ci_as NOT NULL,
  email varchar(150) COLLATE app.ci_as NOT NULL,
  senha_hash varchar(255) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  data_cadastro timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX uq_usuario_email ON app.usuario ((app.text_key(email) COLLATE app.ci_as));

CREATE TABLE app.veiculo (
  id_veiculo integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente_proprietario integer NOT NULL,
  placa varchar(7) COLLATE app.ci_as NOT NULL,
  tipo_veiculo varchar(30) COLLATE app.ci_as NOT NULL,
  marca varchar(50) COLLATE app.ci_as NOT NULL,
  modelo varchar(80) COLLATE app.ci_as NOT NULL,
  ano smallint,
  renavam varchar(11) COLLATE app.ci_as NOT NULL,
  data_cadastro timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_veiculo_cliente FOREIGN KEY (id_cliente_proprietario) REFERENCES app.cliente(id_cliente)
);
CREATE UNIQUE INDEX uq_veiculo_placa ON app.veiculo ((app.text_key(placa) COLLATE app.ci_as));
CREATE UNIQUE INDEX uq_veiculo_renavam ON app.veiculo ((app.text_key(renavam) COLLATE app.ci_as));

CREATE TABLE app.tipo_servico (
  id_tipo_servico integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome varchar(100) COLLATE app.ci_as NOT NULL,
  descricao varchar(200) COLLATE app.ci_as,
  ativo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_tipo_servico_nome ON app.tipo_servico ((app.text_key(nome) COLLATE app.ci_as));

CREATE TABLE app.servico (
  id_servico integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente integer NOT NULL,
  id_veiculo integer NOT NULL,
  id_tipo_servico integer NOT NULL,
  data_inicio timestamp(6) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  data_conclusao timestamp(6),
  status varchar(20) COLLATE app.ci_as NOT NULL DEFAULT 'EM_ANDAMENTO',
  valor_recebido numeric(10,2) NOT NULL,
  observacoes varchar(500) COLLATE app.ci_as,
  data_cadastro timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_servico_cliente FOREIGN KEY (id_cliente) REFERENCES app.cliente(id_cliente),
  CONSTRAINT fk_servico_veiculo FOREIGN KEY (id_veiculo) REFERENCES app.veiculo(id_veiculo),
  CONSTRAINT fk_servico_tipo FOREIGN KEY (id_tipo_servico) REFERENCES app.tipo_servico(id_tipo_servico),
  CONSTRAINT ck_servico_status CHECK (app.text_key(status) COLLATE app.ci_as IN ('EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')),
  CONSTRAINT ck_servico_valor CHECK (valor_recebido >= 0 AND valor_recebido <> 'NaN'::numeric),
  CONSTRAINT ck_servico_conclusao CHECK (data_conclusao IS NULL OR data_conclusao >= data_inicio)
  -- CONCLUIDO requires a date in the current API, not in the original SQL DDL.
  -- Keep that validator in the future adapter; do not silently strengthen the DB contract here.
);

CREATE TABLE app.despesa_servico (
  id_despesa integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_servico integer NOT NULL,
  descricao varchar(150) COLLATE app.ci_as NOT NULL,
  valor numeric(10,2) NOT NULL,
  data_despesa date NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC')::date,
  observacoes varchar(300) COLLATE app.ci_as,
  CONSTRAINT fk_despesa_servico FOREIGN KEY (id_servico) REFERENCES app.servico(id_servico),
  CONSTRAINT ck_despesa_valor CHECK (valor > 0 AND valor <> 'NaN'::numeric)
);

CREATE INDEX ix_servico_status ON app.servico(status);
CREATE INDEX ix_servico_data_inicio ON app.servico(data_inicio);
CREATE INDEX ix_despesa_servico_id_servico ON app.despesa_servico(id_servico);
