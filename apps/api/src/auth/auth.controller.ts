import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { CurrentUser } from '../common/current-user';
import type { Env } from '../config/env.schema';
import type { AuthUser } from './auth.service';
import { AuthService } from './auth.service';
import { OriginGuard } from './origin.guard';
import type { AuthenticatedRequest } from './session.guard';
import { SessionGuard } from './session.guard';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('google')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async google(
    @Body() body: { credential?: unknown },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    if (typeof body.credential !== 'string' || body.credential.length === 0) {
      throw new BadRequestException();
    }
    const result = await this.auth.signInWithGoogle(body.credential);
    response.cookie(
      this.config.get('SESSION_COOKIE_NAME', { infer: true }),
      result.sessionToken,
      this.cookieOptions(),
    );
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard, OriginGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.revokeSession(request.sessionToken);
    response.clearCookie(
      this.config.get('SESSION_COOKIE_NAME', { infer: true }),
      this.cookieOptions(),
    );
  }

  private cookieOptions(): CookieOptions {
    const ttlDays = this.config.get('SESSION_TTL_DAYS', { infer: true });
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    };
  }
}
