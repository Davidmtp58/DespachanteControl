USE DespachanteControl;
GO

/* =====================================================
   VIEW: vw_ResumoFinanceiroServico
   Consolida informações operacionais e financeiras
   de cada serviço.
   ===================================================== */
CREATE OR ALTER VIEW vw_ResumoFinanceiroServico AS
SELECT
    s.id_servico,
    c.nome_razao_social AS cliente,
    v.placa,
    ts.nome AS tipo_servico,
    s.status,
    s.data_inicio,
    s.data_conclusao,
    s.valor_recebido,

    COALESCE(SUM(d.valor), 0) AS custo_total,

    s.valor_recebido
        - COALESCE(SUM(d.valor), 0) AS resultado_liquido

FROM Servico s

INNER JOIN Cliente c
    ON s.id_cliente = c.id_cliente

INNER JOIN Veiculo v
    ON s.id_veiculo = v.id_veiculo

INNER JOIN TipoServico ts
    ON s.id_tipo_servico = ts.id_tipo_servico

LEFT JOIN DespesaServico d
    ON s.id_servico = d.id_servico

GROUP BY
    s.id_servico,
    c.nome_razao_social,
    v.placa,
    ts.nome,
    s.status,
    s.data_inicio,
    s.data_conclusao,
    s.valor_recebido;
GO


/* =====================================================
   VIEW: vw_DashboardResumo
   Retorna os principais indicadores do dashboard.
   ===================================================== */
CREATE OR ALTER VIEW vw_DashboardResumo AS
SELECT
    (
        SELECT COALESCE(SUM(valor_recebido), 0)
        FROM Servico
    ) AS receita_total,

    (
        SELECT COALESCE(SUM(valor), 0)
        FROM DespesaServico
    ) AS custos_totais,

    (
        SELECT COALESCE(SUM(resultado_liquido), 0)
        FROM vw_ResumoFinanceiroServico
    ) AS resultado_liquido,

    (
        SELECT COUNT(*)
        FROM Servico
    ) AS quantidade_servicos,

    (
        SELECT COUNT(*)
        FROM Servico
        WHERE status = 'EM_ANDAMENTO'
    ) AS servicos_em_andamento;
GO
