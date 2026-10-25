import type { RequestHandler } from 'express';
import type { ClienteService } from '../services/cliente-service.js';

export class ClienteController {
  constructor(private readonly service: ClienteService) {}
  list: RequestHandler = async (_req, res) => { res.json(await this.service.list()); };
  find: RequestHandler = async (req, res) => { res.json(await this.service.find(req.params.id)); };
  create: RequestHandler = async (req, res) => {
    const cliente = await this.service.create(req.body);
    res.location(`/api/clientes/${cliente.id_cliente}`).status(201).json(cliente);
  };
  update: RequestHandler = async (req, res) => { res.json(await this.service.update(req.params.id, req.body)); };
}
