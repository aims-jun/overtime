import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';
import { AuthService } from './auth.service';
import type { Env } from '../config/env.schema';
import { InvalidSessionError } from './auth.errors';

export type AuthenticatedRequest = Request & {
  authUser: AuthUser;
  sessionToken: string;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const value: unknown = request.cookies?.[cookieName];
    if (typeof value !== 'string') {
      throw new InvalidSessionError();
    }
    request.authUser = await this.auth.resolveSession(value);
    request.sessionToken = value;
    return true;
  }
}
