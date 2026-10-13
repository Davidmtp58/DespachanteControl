USE DespachanteControl;
GO

/* =====================================================
   DADOS INICIAIS
   Insere tipos de serviço que ainda não existem.
   ===================================================== */

INSERT INTO TipoServico (nome, descricao)
SELECT
    dados.nome,
    dados.descricao
FROM (
    VALUES
        ('Transferência', 'Transferência de propriedade do veículo'),
        ('Licenciamento', 'Regularização ou renovação do licenciamento'),
        ('Emplacamento', 'Serviço relacionado ao emplacamento do veículo'),
        ('Outros', 'Outros serviços prestados pelo despachante')
) AS dados(nome, descricao)

WHERE NOT EXISTS (
    SELECT 1
    FROM TipoServico ts
    WHERE ts.nome = dados.nome
);
GO
