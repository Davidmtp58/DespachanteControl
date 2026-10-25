import type { RequestHandler } from 'express';
import type { FinanceiroService } from '../services/financeiro-service.js';

export class FinanceiroController {
  constructor(private readonly service: FinanceiroService) {}
  dashboard: RequestHandler = async (_req, res) => { res.json(await this.service.dashboard()); };
  list: RequestHandler = async (_req, res) => { res.json(await this.service.list()); };
  find: RequestHandler = async (req, res) => { res.json(await this.service.find(req.params.id)); };
}
