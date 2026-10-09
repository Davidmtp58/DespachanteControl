USE DespachanteControl;
GO

/* =====================================================
   ÍNDICES
   Criados com base nos padrões de consulta do sistema.
   ===================================================== */

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Servico_Status'
      AND object_id = OBJECT_ID('dbo.Servico')
)
BEGIN
    CREATE INDEX IX_Servico_Status
    ON Servico(status);
END;
GO


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Servico_DataInicio'
      AND object_id = OBJECT_ID('dbo.Servico')
)
BEGIN
    CREATE INDEX IX_Servico_DataInicio
    ON Servico(data_inicio);
END;
GO


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_DespesaServico_IdServico'
      AND object_id = OBJECT_ID('dbo.DespesaServico')
)
BEGIN
    CREATE INDEX IX_DespesaServico_IdServico
    ON DespesaServico(id_servico);
END;
GO
