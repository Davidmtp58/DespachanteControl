USE DespachanteControl;
GO

/* =====================================================
   DADOS INICIAIS
   Tipos de serviço padrão do sistema.
   ===================================================== */

INSERT INTO TipoServico (nome, descricao)
VALUES
('Transferência', 'Transferência de propriedade do veículo'),
('Licenciamento', 'Regularização ou renovação do licenciamento'),
('Emplacamento', 'Serviço relacionado ao emplacamento do veículo'),
('Outros', 'Outros serviços prestados pelo despachante');
GO
