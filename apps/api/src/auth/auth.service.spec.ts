import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { UserEntity } from '../database/entities/user.entity';
import { UsersRepository } from '../users/users.repository';
import { AuthService } from './auth.service';
import { ForbiddenCompanyAccountError } from './auth.errors';
import { GoogleVerifier } from './google-verifier';
import type { VerifiedGoogleIdentity } from './google-verifier';
import { SessionRepository } from './session.repository';

const identity: VerifiedGoogleIdentity = {
  subject: 'google-subject-1',
  email: 'admin@company.com',
  name: '관리자',
  pictureUrl: 'https://example.com/profile.png',
  hostedDomain: 'company.com',
};

const user: UserEntity = {
  id: 'user-1',
  googleSubject: identity.subject,
  email: identity.email,
  name: identity.name,
  profileImageUrl: identity.pictureUrl ?? null,
  createdAt: new Date('2026-07-13T00:00:00.000Z'),
  lastLoginAt: new Date('2026-07-13T00:00:00.000Z'),
};

describe('AuthService', () => {
  let service: AuthService;
  let google: jest.Mocked<GoogleVerifier>;
  let users: jest.Mocked<UsersRepository>;
  let sessions: jest.Mocked<SessionRepository>;

  beforeEach(() => {
    google = { verify: jest.fn() };
    users = { upsertGoogleUser: jest.fn() };
    sessions = {
      create: jest.fn(),
      findActiveUserByTokenHash: jest.fn(),
      revokeByTokenHash: jest.fn(),
    };
    const values = {
      GOOGLE_HOSTED_DOMAIN: 'company.com',
      ADMIN_EMAILS: ['admin@company.com'],
      SESSION_TTL_DAYS: 7,
      SESSION_HASH_SECRET: '12345678901234567890123456789012',
    };
    const config = {
      get: jest.fn((key: keyof typeof values) => values[key]),
    } as unknown as ConfigService<Env, true>;

    service = new AuthService(config, google, users, sessions);
  });

  it('rejects an identity outside the configured hosted domain', async () => {
    google.verify.mockResolvedValue({
      ...identity,
      hostedDomain: 'other.com',
    });

    await expect(service.signInWithGoogle('credential')).rejects.toBeInstanceOf(
      ForbiddenCompanyAccountError,
    );
    expect(users.upsertGoogleUser.mock.calls).toHaveLength(0);
  });

  it('stores only a hash of the session token', async () => {
    google.verify.mockResolvedValue(identity);
    users.upsertGoogleUser.mockResolvedValue(user);

    const result = await service.signInWithGoogle('credential');

    expect(result.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions.create.mock.calls).toHaveLength(1);
    const createdSession = sessions.create.mock.calls[0]?.[0];
    expect(createdSession?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdSession?.userId).toBe(user.id);
    expect(createdSession?.tokenHash).not.toBe(result.sessionToken);
  });

  it('derives administrator status from the configured email allowlist', async () => {
    sessions.findActiveUserByTokenHash.mockResolvedValue(user);

    await expect(service.resolveSession('a'.repeat(64))).resolves.toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: true,
    });
  });
});
