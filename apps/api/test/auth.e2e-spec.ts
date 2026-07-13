import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GoogleVerifier } from '../src/auth/google-verifier';
import type { VerifiedGoogleIdentity } from '../src/auth/google-verifier';

class FakeGoogleVerifier implements GoogleVerifier {
  identity: VerifiedGoogleIdentity = {
    subject: 'google-subject-1',
    email: 'admin@company.com',
    name: '관리자',
    hostedDomain: 'company.com',
  };

  verify(): Promise<VerifiedGoogleIdentity> {
    return Promise.resolve(this.identity);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('authentication API', () => {
  let app: INestApplication<App>;
  let google: FakeGoogleVerifier;

  beforeEach(async () => {
    google = new FakeGoogleVerifier();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier)
      .useValue(google)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'google-credential' })
      .expect(200);
    const headers = response.headers as unknown;
    if (!isRecord(headers)) {
      throw new Error('Login response did not contain headers');
    }
    const cookie = headers['set-cookie'];
    if (
      !Array.isArray(cookie) ||
      !cookie.every((value: unknown) => typeof value === 'string') ||
      !cookie[0]
    ) {
      throw new Error('Login response did not set a session cookie');
    }
    return cookie[0];
  }

  it('creates a secure server session and resolves the current user', async () => {
    const cookie = await login();

    expect(cookie).toContain('overtime_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    const body = response.body as unknown;
    expect(body).toMatchObject({
      user: {
        email: 'admin@company.com',
        name: '관리자',
        isAdmin: true,
      },
    });
    if (!isRecord(body) || !isRecord(body.user)) {
      throw new Error('Current-user response had an invalid shape');
    }
    expect(typeof body.user.id).toBe('string');
  });

  it('rejects a Google account outside the company domain', async () => {
    google.identity = { ...google.identity, hostedDomain: 'other.com' };

    const response = await request(app.getHttpServer())
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'google-credential' })
      .expect(403);
    const body = response.body as unknown;
    expect(body).toMatchObject({ code: 'FORBIDDEN_COMPANY_ACCOUNT' });
  });

  it('accepts a state-changing request from every configured origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5175')
      .send({ credential: 'google-credential' })
      .expect(200);
  });

  it('rejects a state-changing request from another origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/google')
      .set('Origin', 'https://attacker.example')
      .send({ credential: 'google-credential' })
      .expect(403);
  });

  it('revokes the session on logout', async () => {
    const cookie = await login();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });
});
