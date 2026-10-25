import type { RequestHandler } from 'express';
import type { ServicoService } from '../services/servico-service.js';

export class ServicoController {
  constructor(private readonly service: ServicoService) {}
  list: RequestHandler = async (_req, res) => { res.json(await this.service.list()); };
  types: RequestHandler = async (_req, res) => { res.json(await this.service.types()); };
  find: RequestHandler = async (req, res) => { res.json(await this.service.find(req.params.id)); };
  create: RequestHandler = async (req, res) => {
    const result = await this.service.create(req.body);
    res.location(`/api/servicos/${result.id_servico}`).status(201).json(result);
  };
  update: RequestHandler = async (req, res) => { res.json(await this.service.update(req.params.id, req.body)); };
}
