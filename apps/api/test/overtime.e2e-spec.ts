import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GoogleVerifier } from '../src/auth/google-verifier';
import type { VerifiedGoogleIdentity } from '../src/auth/google-verifier';

class FakeGoogleVerifier implements GoogleVerifier {
  identity: VerifiedGoogleIdentity = {
    subject: 'employee-1',
    email: 'employee1@company.com',
    name: '직원 1',
    hostedDomain: 'company.com',
  };

  verify(): Promise<VerifiedGoogleIdentity> {
    return Promise.resolve(this.identity);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('employee overtime API', () => {
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
    if (!isRecord(headers)) throw new Error('Login response had no headers');
    const cookies = headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string') {
      throw new Error('Login response had no cookie');
    }
    return cookies[0];
  }

  function createRecord(cookie: string) {
    return request(app.getHttpServer())
      .post('/api/overtime')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        workDate: '2026-07-13',
        startTime: '22:00',
        endTime: '01:30',
        reason: '배포 대응',
      });
  }

  it('creates midnight overtime and returns the monthly total', async () => {
    const cookie = await login();
    const created = await createRecord(cookie).expect(201);
    const createdBody = created.body as unknown;
    expect(createdBody).toMatchObject({
      workDate: '2026-07-13',
      startTime: '22:00',
      endTime: '01:30',
      durationMinutes: 210,
      reason: '배포 대응',
    });

    const listed = await request(app.getHttpServer())
      .get('/api/overtime?month=2026-07')
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body as unknown).toMatchObject({
      month: '2026-07',
      totalMinutes: 210,
      records: [{ durationMinutes: 210 }],
    });
  });

  it('rejects overlapping records', async () => {
    const cookie = await login();
    await createRecord(cookie).expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/overtime')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        workDate: '2026-07-13',
        startTime: '23:00',
        endTime: '02:00',
        reason: '추가 대응',
      })
      .expect(409);
    expect(response.body as unknown).toMatchObject({
      code: 'OVERTIME_OVERLAP',
    });
  });

  it('hides another employee record from update and delete', async () => {
    const ownerCookie = await login();
    const created = await createRecord(ownerCookie).expect(201);
    const body = created.body as unknown;
    if (!isRecord(body) || typeof body.id !== 'string') {
      throw new Error('Create response had no record id');
    }

    google.identity = {
      ...google.identity,
      subject: 'employee-2',
      email: 'employee2@company.com',
      name: '직원 2',
    };
    const otherCookie = await login();
    const replacement = {
      workDate: '2026-07-13',
      startTime: '18:00',
      endTime: '20:00',
      reason: '수정 시도',
    };

    await request(app.getHttpServer())
      .patch(`/api/overtime/${body.id}`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', otherCookie)
      .send(replacement)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/overtime/${body.id}`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', otherCookie)
      .expect(404);
  });

  it('rejects an invalid month and unknown input fields', async () => {
    const cookie = await login();

    await request(app.getHttpServer())
      .get('/api/overtime?month=2026-13')
      .set('Cookie', cookie)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/overtime')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        workDate: '2026-07-13',
        startTime: '18:00',
        endTime: '20:00',
        reason: '입력',
        userId: 'other-user',
      })
      .expect(400);
  });
});
