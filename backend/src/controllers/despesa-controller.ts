import type { RequestHandler } from 'express';
import type { DespesaService } from '../services/despesa-service.js';

export class DespesaController {
  constructor(private readonly service: DespesaService) {}
  list: RequestHandler = async (_req, res) => { res.json(await this.service.list()); };
  byService: RequestHandler = async (req, res) => { res.json(await this.service.byService(req.params.id)); };
  find: RequestHandler = async (req, res) => { res.json(await this.service.find(req.params.id)); };
  create: RequestHandler = async (req, res) => {
    const result = await this.service.create(req.body);
    res.location(`/api/despesas/${result.id_despesa}`).status(201).json(result);
  };
  update: RequestHandler = async (req, res) => { res.json(await this.service.update(req.params.id, req.body)); };
  delete: RequestHandler = async (req, res) => { await this.service.delete(req.params.id); res.status(204).end(); };
}
