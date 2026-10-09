USE DespachanteControl;
GO

/* =====================================================
   CONSULTAS ANALÍTICAS
   Consultas utilizadas para análise operacional
   e financeira do sistema.
   ===================================================== */


/* Receita por mês */
SELECT
    YEAR(data_inicio) AS ano,
    MONTH(data_inicio) AS mes,
    SUM(valor_recebido) AS receita_total
FROM Servico
GROUP BY
    YEAR(data_inicio),
    MONTH(data_inicio)
ORDER BY
    ano,
    mes;
GO


/* Serviços mais realizados */
SELECT
    ts.nome AS tipo_servico,
    COUNT(*) AS quantidade_servicos
FROM Servico s
INNER JOIN TipoServico ts
    ON s.id_tipo_servico = ts.id_tipo_servico
GROUP BY
    ts.nome
ORDER BY
    quantidade_servicos DESC;
GO


/* Resumo geral do dashboard */
SELECT *
FROM vw_DashboardResumo;
GO


/* Resumo financeiro por serviço */
SELECT *
FROM vw_ResumoFinanceiroServico
ORDER BY id_servico;
GO


/* Quantidade de serviços por status */
SELECT
    status,
    COUNT(*) AS quantidade
FROM Servico
GROUP BY
    status
ORDER BY
    quantidade DESC;
GO
