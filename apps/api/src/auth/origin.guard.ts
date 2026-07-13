import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ApplicationError } from '../common/errors/application.error';
import type { Env } from '../config/env.schema';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const allowedOrigin = this.config.get('APP_ORIGIN', { infer: true });
    if (request.header('origin') !== allowedOrigin) {
      throw new ApplicationError(
        'INVALID_ORIGIN',
        403,
        '허용되지 않은 요청 출처입니다',
      );
    }
    return true;
  }
}
