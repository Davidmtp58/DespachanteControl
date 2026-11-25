-- Administrative preparation, NOT an application startup script.
-- Roles have no login/password. Future login provisioning is a separate operation.
DO $$ BEGIN
  -- Inspect ALL existing identities before creating or changing any role.
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dc_runtime') THEN
    RAISE EXCEPTION 'Runtime already exists; review deployment before bootstrap';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('dc_api','dc_migrator')
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolcanlogin OR rolreplication)) THEN
    RAISE EXCEPTION 'Existing role attributes require administrative review';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('dc_api','dc_migrator')) THEN
    RAISE EXCEPTION 'Existing role inherits other roles; review required';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
    WHERE r.rolname IN ('dc_api','dc_migrator') AND m.member <> current_user::regrole) THEN
    RAISE EXCEPTION 'Unexpected member of deployment roles';
  END IF;
  IF NOT has_database_privilege(current_user, current_database(), 'CREATE WITH GRANT OPTION') THEN
    RAISE EXCEPTION 'Database CREATE grant option required';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dc_migrator') THEN
    CREATE ROLE dc_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dc_api') THEN
    CREATE ROLE dc_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('dc_api','dc_migrator')
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Existing role attributes require administrative review';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members WHERE member = 'dc_api'::regrole) THEN
    RAISE EXCEPTION 'Existing API role memberships require administrative review';
  END IF;
  EXECUTE format('GRANT CREATE ON DATABASE %I TO dc_migrator', current_database());
  -- PG16+: automatic CREATEROLE membership may have SET/INHERIT FALSE.
  -- Do not revoke or alter grants owned by a managed superuser.
  EXECUTE format('GRANT dc_migrator TO %I WITH ADMIN FALSE, SET TRUE, INHERIT FALSE', current_user);
END $$;
