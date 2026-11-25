INSERT INTO app.tipo_servico (nome, descricao) VALUES
  ('Transferência', 'Transferência de propriedade do veículo'),
  ('Licenciamento', 'Regularização ou renovação do licenciamento'),
  ('Emplacamento', 'Serviço relacionado ao emplacamento do veículo'),
  ('Outros', 'Outros serviços prestados pelo despachante')
ON CONFLICT DO NOTHING;
