-- READ ONLY. Execute on the original database with an already authorized account.
-- No table records, secrets, INSERT/UPDATE/DELETE or configuration changes.
SELECT CONVERT(varchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) AS database_collation;
SELECT t.name AS table_name, c.name AS column_name, c.collation_name
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE s.name = 'dbo' AND t.name IN ('Cliente','Usuario','Veiculo','TipoServico','Servico','DespesaServico')
  AND c.collation_name IS NOT NULL
ORDER BY t.name,c.column_id;

SELECT label,
  CASE WHEN a=b THEN 1 ELSE 0 END AS unicode_equal,
  CASE WHEN CAST(a AS varchar(100))=CAST(b AS varchar(100)) THEN 1 ELSE 0 END AS varchar_equal
FROM (VALUES
  ('case',N'A',N'a'), ('accent',N'Jose',N'Jos'+NCHAR(233)),
  ('space',N'abc',N'abc '), ('unicode',NCHAR(233),N'e'+NCHAR(769)),
  ('sharp_s',N'stra'+NCHAR(223)+N'e',N'strasse'),
  ('ligature',NCHAR(230),N'ae'), ('punctuation',N'a-b',N'ab')
) synthetic(label,a,b);
