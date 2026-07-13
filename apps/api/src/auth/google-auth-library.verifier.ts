import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env.schema';
import { InvalidGoogleCredentialError } from './auth.errors';
import { GoogleVerifier } from './google-verifier';
import type { VerifiedGoogleIdentity } from './google-verifier';

@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
    this.client = new OAuth2Client(
      this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
    );
  }

  async verify(credential: string): Promise<VerifiedGoogleIdentity> {
    try {
      const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        !payload.hd
      ) {
        throw new InvalidGoogleCredentialError();
      }
      return {
        subject: payload.sub,
        email: payload.email,
        name: payload.name?.trim() || payload.email,
        ...(payload.picture ? { pictureUrl: payload.picture } : {}),
        hostedDomain: payload.hd,
      };
    } catch (error) {
      if (error instanceof InvalidGoogleCredentialError) {
        throw error;
      }
      throw new InvalidGoogleCredentialError();
    }
  }
}
