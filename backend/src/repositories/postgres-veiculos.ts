import type { PostgresExecutor } from '../database/postgres.js';
import type { VeiculoRepository } from './veiculo-repository.js';
import type { Veiculo, VeiculoInput } from '../services/veiculo-validation.js';

const columns = 'id_veiculo,id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,ano,renavam,data_cadastro';
const values = (data: VeiculoInput) => [data.id_cliente_proprietario, data.placa, data.tipo_veiculo,
  data.marca, data.modelo, data.ano, data.renavam];
export class PostgresVeiculoRepository implements VeiculoRepository {
  constructor(private readonly database: PostgresExecutor) {}
  list() { return this.database.query<Veiculo>(`SELECT ${columns} FROM app.veiculo ORDER BY id_veiculo`); }
  async find(id: number) {
    return (await this.database.query<Veiculo>(`SELECT ${columns} FROM app.veiculo WHERE id_veiculo=$1`, [id]))[0];
  }
  async ownerExists(id: number) {
    return (await this.database.query('SELECT id_cliente FROM app.cliente WHERE id_cliente=$1', [id])).length > 0;
  }
  async conflicts(data: VeiculoInput, excludeId?: number) {
    // Equality must use precisely the expression/collation of the UNIQUE indexes.
    const plate = 'app.text_key(placa) COLLATE app.ci_as = app.text_key($1::text) COLLATE app.ci_as';
    const renavam = 'app.text_key(renavam) COLLATE app.ci_as = app.text_key($2::text) COLLATE app.ci_as';
    const rows = await this.database.query<{ placa: boolean; renavam: boolean }>(
      `SELECT (${plate}) AS placa, (${renavam}) AS renavam FROM app.veiculo
       WHERE ((${plate}) OR (${renavam})) AND ($3::integer IS NULL OR id_veiculo<>$3)`,
      [data.placa, data.renavam, excludeId ?? null]);
    return { placa: rows.some(row => row.placa === true), renavam: rows.some(row => row.renavam === true) };
  }
  async create(data: VeiculoInput) {
    const rows = await this.database.query<Veiculo>(`INSERT INTO app.veiculo
      (id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,ano,renavam)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`, values(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: VeiculoInput) {
    return (await this.database.query<Veiculo>(`UPDATE app.veiculo SET id_cliente_proprietario=$1,
      placa=$2,tipo_veiculo=$3,marca=$4,modelo=$5,ano=$6,renavam=$7
      WHERE id_veiculo=$8 RETURNING ${columns}`, [...values(data), id]))[0];
  }
}
