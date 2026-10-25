import sql from 'mssql';
import type { QueryExecutor, SqlParameter } from '../database/connection.js';
import type { Veiculo, VeiculoInput } from '../services/veiculo-validation.js';

export interface VeiculoRepository {
  list(): Promise<Veiculo[]>;
  find(id: number): Promise<Veiculo | undefined>;
  ownerExists(id: number): Promise<boolean>;
  conflicts(data: VeiculoInput, excludeId?: number): Promise<{ placa: boolean; renavam: boolean }>;
  create(data: VeiculoInput): Promise<Veiculo>;
  update(id: number, data: VeiculoInput): Promise<Veiculo | undefined>;
}
const columns = 'id_veiculo, id_cliente_proprietario, placa, tipo_veiculo, marca, modelo, ano, renavam, data_cadastro';
const output = columns.split(', ').map(column => `INSERTED.${column}`).join(', ');
const idParameter = (id: number): SqlParameter => ({ name: 'id', type: sql.Int(), value: id });
function parameters(data: VeiculoInput): SqlParameter[] {
  return [
    { name: 'proprietario', type: sql.Int(), value: data.id_cliente_proprietario },
    { name: 'placa', type: sql.VarChar(7), value: data.placa },
    { name: 'tipo', type: sql.VarChar(30), value: data.tipo_veiculo },
    { name: 'marca', type: sql.VarChar(50), value: data.marca },
    { name: 'modelo', type: sql.VarChar(80), value: data.modelo },
    { name: 'ano', type: sql.SmallInt(), value: data.ano },
    { name: 'renavam', type: sql.VarChar(11), value: data.renavam },
  ];
}

export class SqlVeiculoRepository implements VeiculoRepository {
  constructor(private readonly database: QueryExecutor) {}
  async conflicts(data: VeiculoInput, excludeId?: number) {
    const rows = await this.database.query<{ placa: boolean; renavam: boolean }>(`SELECT
      CAST(CASE WHEN placa = @placa THEN 1 ELSE 0 END AS bit) AS placa,
      CAST(CASE WHEN renavam = @renavam THEN 1 ELSE 0 END AS bit) AS renavam
      FROM dbo.Veiculo WHERE (placa = @placa OR renavam = @renavam)
      AND (@excludeId IS NULL OR id_veiculo <> @excludeId)`, [
      { name: 'placa', type: sql.VarChar(7), value: data.placa },
      { name: 'renavam', type: sql.VarChar(11), value: data.renavam },
      { name: 'excludeId', type: sql.Int(), value: excludeId ?? null },
    ]);
    return { placa: rows.some(row => row.placa === true), renavam: rows.some(row => row.renavam === true) };
  }
  list() { return this.database.query<Veiculo>(`SELECT ${columns} FROM dbo.Veiculo ORDER BY id_veiculo`); }
  async find(id: number) {
    return (await this.database.query<Veiculo>(`SELECT ${columns} FROM dbo.Veiculo WHERE id_veiculo = @id`, [idParameter(id)]))[0];
  }
  async ownerExists(id: number) {
    const rows = await this.database.query<{ id_cliente: number }>('SELECT id_cliente FROM dbo.Cliente WHERE id_cliente = @id', [idParameter(id)]);
    return rows.length > 0;
  }
  async create(data: VeiculoInput) {
    const rows = await this.database.query<Veiculo>(`INSERT INTO dbo.Veiculo
      (id_cliente_proprietario, placa, tipo_veiculo, marca, modelo, ano, renavam)
      OUTPUT ${output} VALUES (@proprietario, @placa, @tipo, @marca, @modelo, @ano, @renavam)`, parameters(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: VeiculoInput) {
    return (await this.database.query<Veiculo>(`UPDATE dbo.Veiculo SET
      id_cliente_proprietario = @proprietario, placa = @placa, tipo_veiculo = @tipo,
      marca = @marca, modelo = @modelo, ano = @ano, renavam = @renavam
      OUTPUT ${output} WHERE id_veiculo = @id`, [...parameters(data), idParameter(id)]))[0];
  }
}
