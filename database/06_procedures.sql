USE DespachanteControl;
GO

/* =====================================================
   PROCEDURE: sp_ResumoFinanceiroServico
   Retorna o resumo financeiro de um serviço específico.
   ===================================================== */

CREATE OR ALTER PROCEDURE sp_ResumoFinanceiroServico
    @id_servico INT
AS
BEGIN
    SELECT
        s.id_servico,
        c.nome_razao_social AS cliente,
        v.placa,
        ts.nome AS tipo_servico,
        s.status,
        s.valor_recebido,
        COALESCE(SUM(d.valor), 0) AS custo_total,
        s.valor_recebido - COALESCE(SUM(d.valor), 0) AS resultado_liquido

    FROM Servico s

    INNER JOIN Cliente c
        ON s.id_cliente = c.id_cliente

    INNER JOIN Veiculo v
        ON s.id_veiculo = v.id_veiculo

    INNER JOIN TipoServico ts
        ON s.id_tipo_servico = ts.id_tipo_servico

    LEFT JOIN DespesaServico d
        ON s.id_servico = d.id_servico

    WHERE s.id_servico = @id_servico

    GROUP BY
        s.id_servico,
        c.nome_razao_social,
        v.placa,
        ts.nome,
        s.status,
        s.valor_recebido;
END;
GO
