# Verificação B1 — precisão financeira

Consultas de leitura executadas em localhost\\SQLEXPRESS, banco DespachanteControl, com SQLCMD e autenticação integrada, em 2026-10-20. Nenhuma credencial foi impressa. O sandbox inicialmente impediu a conexão ODBC; a consulta foi executada fora dele com autorização. Nenhum INSERT, UPDATE, DELETE, DDL ou execução da procedure foi utilizado.

## Resultado reproduzido

| Cenário | Receita | Despesas | Esperado | Expressão atual | Exato |
| --- | --- | --- | --- | --- | --- |
| Uma despesa | 150.01 | 10.02 | 139.99 | 139.99 | Sim |
| Duas despesas de 5.01 | 150.01 | 10.02 | 139.99 | 139.99 | Sim |
| Sem despesas | 150.01 | 0.00 | 150.01 | 150.01 | Sim |
| Resultado negativo | 50.01 | 100.03 | -50.02 | -50.02 | Sim |
| Limite do valor por serviço | 99999999.99 | 0.01 | 99999999.98 | 99999999.98 | Sim |

SUM e COALESCE retornaram precisão 38, escala 2. Sem despesas, SUM é NULL e SQL_VARIANT_PROPERTY do valor NULL retorna NULL; COALESCE retorna 0.00 com precisão 38/escala 2. A subtração atual também retornou precisão 38, escala 2. A conversão final do backend para decimal(38,2) preservou exatamente todos os resultados. Comparações foram realizadas dentro do SQL Server, sem FLOAT ou aritmética financeira em JavaScript.

A hipótese levantada na auditoria **não foi confirmada** nestes cenários. Não se deve aplicar mecanicamente a regra de reduzir uma casa decimal só porque a fórmula intermediária de precisão ultrapassa 38: o comportamento real desta subtração preservou a escala 2. A alternativa com CAST do custo para decimal(37,2) foi avaliada apenas como expressão sintética de comparação; não trouxe correção necessária nem foi aplicada aos objetos. Não há proposta de alteração SQL justificada por estes resultados.

## Consulta sintética executada

A consulta usa somente CTEs, VALUES e SELECT; não lê registros de negócio. Pode ser repetida no SSMS.

```sql
WITH c AS (
 SELECT * FROM (VALUES
 (1,'uma_despesa',CAST(150.01 AS decimal(10,2)),CAST(139.99 AS decimal(10,2))),
 (2,'multiplas',CAST(150.01 AS decimal(10,2)),CAST(139.99 AS decimal(10,2))),
 (3,'sem_despesas',CAST(150.01 AS decimal(10,2)),CAST(150.01 AS decimal(10,2))),
 (4,'negativo',CAST(50.01 AS decimal(10,2)),CAST(-50.02 AS decimal(10,2))),
 (5,'limite_valor',CAST(99999999.99 AS decimal(10,2)),CAST(99999999.98 AS decimal(10,2)))
 ) v(id,cenario,receita,esperado)
), d AS (
 SELECT * FROM (VALUES (1,CAST(10.02 AS decimal(10,2))), (2,CAST(5.01 AS decimal(10,2))),
 (2,CAST(5.01 AS decimal(10,2))), (4,CAST(100.03 AS decimal(10,2))), (5,CAST(0.01 AS decimal(10,2)))) v(id,valor)
), t AS (
 SELECT c.id,c.cenario,c.receita,c.esperado,SUM(d.valor) soma,COALESCE(SUM(d.valor),0) custo
 FROM c LEFT JOIN d ON d.id=c.id GROUP BY c.id,c.cenario,c.receita,c.esperado
), r AS (
 SELECT *,receita-custo atual,receita-CAST(custo AS decimal(37,2)) proposto FROM t
)
SELECT cenario,CONVERT(varchar(41),receita) receita,CONVERT(varchar(41),custo) custo,
 CONVERT(varchar(41),esperado) esperado,CONVERT(varchar(41),atual) atual,
 CONVERT(varchar(41),CAST(atual AS decimal(38,2))) formatacao_backend,
 CONVERT(varchar(41),proposto) proposto,
 CONVERT(int,SQL_VARIANT_PROPERTY(soma,'Precision')) soma_p,CONVERT(int,SQL_VARIANT_PROPERTY(soma,'Scale')) soma_s,
 CONVERT(int,SQL_VARIANT_PROPERTY(custo,'Precision')) custo_p,CONVERT(int,SQL_VARIANT_PROPERTY(custo,'Scale')) custo_s,
 CONVERT(int,SQL_VARIANT_PROPERTY(atual,'Precision')) atual_p,CONVERT(int,SQL_VARIANT_PROPERTY(atual,'Scale')) atual_s,
 CONVERT(int,SQL_VARIANT_PROPERTY(proposto,'Precision')) proposto_p,CONVERT(int,SQL_VARIANT_PROPERTY(proposto,'Scale')) proposto_s,
 CASE WHEN atual=esperado THEN 1 ELSE 0 END atual_exato,CASE WHEN proposto=esperado THEN 1 ELSE 0 END proposto_exato
FROM r ORDER BY id;
```

Os cenários comprovam a expressão e os tipos avaliados; não constituem teste exaustivo de todos os volumes possíveis nem investigam a instabilidade intermitente da conexão.

## Limitação da consulta adicional

Uma consulta adicional a `sys.columns` e `sys.dm_exec_describe_first_result_set_for_object` para conferir os metadados das Views/procedure existentes retornou somente `Tempo limite expirou`, sem resultados. Portanto, as precisões acima foram comprovadas nas expressões sintéticas reproduzidas a partir dos scripts; não foram obtidas dos metadados dos objetos instalados. Não se comprovou a causa desse timeout e não se alteraram parâmetros da aplicação para contorná-lo.
