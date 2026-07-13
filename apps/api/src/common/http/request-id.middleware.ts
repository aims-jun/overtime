import { Injectable, Logger } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();

    (request as Request & { requestId: string }).requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.once('finish', () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.originalUrl,
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });
    next();
  }
}
