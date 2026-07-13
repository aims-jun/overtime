import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.schema';
import { UsersRepository } from '../users/users.repository';
import {
  ForbiddenCompanyAccountError,
  InvalidSessionError,
} from './auth.errors';
import { GoogleVerifier } from './google-verifier';
import { SessionRepository } from './session.repository';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly google: GoogleVerifier,
    private readonly users: UsersRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async signInWithGoogle(
    credential: string,
  ): Promise<{ user: AuthUser; sessionToken: string }> {
    const identity = await this.google.verify(credential);
    const hostedDomain = identity.hostedDomain.trim().toLowerCase();
    const allowedDomain = this.config.get('GOOGLE_HOSTED_DOMAIN', {
      infer: true,
    });
    if (hostedDomain !== allowedDomain) {
      throw new ForbiddenCompanyAccountError();
    }

    const now = new Date();
    const user = await this.users.upsertGoogleUser({
      googleSubject: identity.subject,
      email: identity.email.trim().toLowerCase(),
      name: identity.name.trim(),
      profileImageUrl: identity.pictureUrl ?? null,
      lastLoginAt: now,
    });
    const sessionToken = randomBytes(32).toString('hex');
    const ttlDays = this.config.get('SESSION_TTL_DAYS', { infer: true });
    await this.sessions.create({
      id: randomUUID(),
      tokenHash: this.hashToken(sessionToken),
      userId: user.id,
      expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000),
    });

    return {
      user: this.toAuthUser(user),
      sessionToken,
    };
  }

  async resolveSession(sessionToken: string): Promise<AuthUser> {
    if (!/^[a-f0-9]{64}$/.test(sessionToken)) {
      throw new InvalidSessionError();
    }
    const user = await this.sessions.findActiveUserByTokenHash(
      this.hashToken(sessionToken),
      new Date(),
    );
    if (!user) {
      throw new InvalidSessionError();
    }
    return this.toAuthUser(user);
  }

  async revokeSession(sessionToken: string): Promise<void> {
    if (/^[a-f0-9]{64}$/.test(sessionToken)) {
      await this.sessions.revokeByTokenHash(this.hashToken(sessionToken));
    }
  }

  private hashToken(sessionToken: string): string {
    const secret = this.config.get('SESSION_HASH_SECRET', { infer: true });
    return createHmac('sha256', secret).update(sessionToken).digest('hex');
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    name: string;
  }): AuthUser {
    const administrators = this.config.get('ADMIN_EMAILS', { infer: true });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: administrators.includes(user.email.toLowerCase()),
    };
  }
}
