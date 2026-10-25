import type { ErrorRequestHandler } from 'express';
import { diagnostic } from '../diagnostics.js';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const parserError = error as { type?: string; status?: number } | null;
  if (parserError?.type && parserError.status && parserError.status >= 400 && parserError.status < 500) {
    res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Corpo JSON inválido ou acima do limite permitido.' } });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('API: erro interno não tratado.');
  diagnostic(error, 'http_unhandled');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
};
