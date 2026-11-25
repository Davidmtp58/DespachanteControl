-- Read-only inventory. Does not prove project identity: compare the Connect panel
-- host/project reference separately before authorizing any remote operation.
BEGIN READ ONLY;
SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       current_setting('server_version_num')::integer AS server_version_num,
       current_setting('server_encoding') AS encoding,
       current_setting('TimeZone') AS timezone,
       current_setting('statement_timeout') AS statement_timeout;
SELECT EXISTS (SELECT FROM pg_collation WHERE collprovider = 'i') AS icu_available,
       normalize(U&'e\0301', NFC) = U&'\00E9' AS nfc_available;
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN (current_user, 'dc_api', 'dc_migrator', 'dc_runtime');
SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema;
SELECT nspname, pg_get_userbyid(nspowner) AS owner
FROM pg_namespace WHERE nspname IN ('app', 'dc_migrations');
SELECT collname, collversion, pg_collation_actual_version(oid) AS actual_version,
       collisdeterministic
FROM pg_collation WHERE collnamespace = to_regnamespace('app');
-- This sees the database-side connection, NOT necessarily client-to-pooler TLS.
SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid();
COMMIT;
