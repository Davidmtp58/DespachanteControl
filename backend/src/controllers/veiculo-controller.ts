import type { RequestHandler } from 'express';
import type { VeiculoService } from '../services/veiculo-service.js';

export class VeiculoController {
  constructor(private readonly service: VeiculoService) {}
  list: RequestHandler = async (_req, res) => { res.json(await this.service.list()); };
  find: RequestHandler = async (req, res) => { res.json(await this.service.find(req.params.id)); };
  create: RequestHandler = async (req, res) => {
    const vehicle = await this.service.create(req.body);
    res.location(`/api/veiculos/${vehicle.id_veiculo}`).status(201).json(vehicle);
  };
  update: RequestHandler = async (req, res) => { res.json(await this.service.update(req.params.id, req.body)); };
}
