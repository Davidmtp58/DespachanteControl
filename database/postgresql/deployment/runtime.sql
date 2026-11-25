-- Administrative, one-time operation AFTER migrations. No password in this file.
-- Repeated/partial deployments require review, not automatic privilege repair.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dc_runtime') THEN
    RAISE EXCEPTION 'Runtime already exists; refusing to modify identity';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dc_api'
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolcanlogin OR rolreplication))
    OR EXISTS (SELECT FROM pg_auth_members WHERE member = 'dc_api'::regrole) THEN
    RAISE EXCEPTION 'API group requires review';
  END IF;
  -- PUBLIC privileges cannot be denied to an individual login. Stop rather than
  -- silently modifying shared schemas/databases belonging to Supabase.
  IF EXISTS (SELECT FROM pg_namespace n,
    LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE a.grantee = 0 AND a.privilege_type = 'CREATE') THEN
    RAISE EXCEPTION 'PUBLIC schema CREATE requires separate review';
  END IF;
  IF EXISTS (SELECT FROM pg_database d,
    LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
    WHERE d.datname = current_database() AND a.grantee = 0 AND a.privilege_type = 'CREATE') THEN
    RAISE EXCEPTION 'PUBLIC database CREATE requires separate review';
  END IF;
  CREATE ROLE dc_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
  GRANT dc_api TO dc_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO dc_runtime', current_database());
END $$;
