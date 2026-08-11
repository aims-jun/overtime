import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { VerifiedGoogleIdentity } from '../src/auth/google-verifier';
import { GoogleVerifier } from '../src/auth/google-verifier';

class FakeGoogleVerifier implements GoogleVerifier {
  identity: VerifiedGoogleIdentity = {
    subject: 'employee-subject',
    email: 'worker@company.com',
    name: '김직원',
    hostedDomain: 'company.com',
  };

  verify(): Promise<VerifiedGoogleIdentity> {
    return Promise.resolve(this.identity);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('administrator reports API', () => {
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

  afterEach(async () => app.close());

  async function login(identity: VerifiedGoogleIdentity): Promise<{
    cookie: string;
    userId: string;
  }> {
    google.identity = identity;
    const response = await request(app.getHttpServer())
      .post('/api/auth/google')
      .set('Origin', 'http://localhost:5173')
      .send({ credential: 'credential' })
      .expect(200);
    const headers = response.headers as unknown;
    const body = response.body as unknown;
    if (!isRecord(headers) || !isRecord(body) || !isRecord(body.user)) {
      throw new Error('Invalid login response');
    }
    const cookies = headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string') {
      throw new Error('No login cookie');
    }
    if (typeof body.user.id !== 'string') throw new Error('No user id');
    return { cookie: cookies[0], userId: body.user.id };
  }

  async function create(cookie: string, reason: string, startTime = '18:00') {
    await request(app.getHttpServer())
      .post('/api/overtime')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        workDate: '2026-07-13',
        startTime,
        endTime: startTime === '18:00' ? '20:00' : '20:30',
        reason,
      })
      .expect(201);
  }

  const employeeIdentity: VerifiedGoogleIdentity = {
    subject: 'employee-subject',
    email: 'worker@company.com',
    name: '김직원',
    hostedDomain: 'company.com',
  };
  const adminIdentity: VerifiedGoogleIdentity = {
    subject: 'admin-subject',
    email: 'admin@company.com',
    name: '박관리',
    hostedDomain: 'company.com',
  };

  it('forbids an employee from every administrator endpoint', async () => {
    const employee = await login(employeeIdentity);
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', employee.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/reports?month=2026-07')
      .set('Cookie', employee.cookie)
      .expect(403);
  });

  it('returns all-user totals and an exact single-user filter', async () => {
    const employee = await login(employeeIdentity);
    await create(employee.cookie, '배포 대응');
    const admin = await login(adminIdentity);
    await create(admin.cookie, '승인 업무', '19:00');

    const all = await request(app.getHttpServer())
      .get('/api/admin/reports?month=2026-07')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(all.body as unknown).toMatchObject({
      totalMinutes: 210,
      totalsByUser: [
        { user: { email: 'worker@company.com' }, totalMinutes: 120 },
        { user: { email: 'admin@company.com' }, totalMinutes: 90 },
      ],
    });

    const filtered = await request(app.getHttpServer())
      .get(`/api/admin/reports?month=2026-07&userId=${employee.userId}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(filtered.body as unknown).toMatchObject({
      totalMinutes: 120,
      records: [{ user: { email: 'worker@company.com' } }],
    });
  });

  it('exports an Excel workbook and rejects invalid filters', async () => {
    const employee = await login(employeeIdentity);
    await create(employee.cookie, '=SUM(1,1)');
    const admin = await login(adminIdentity);

    const excel = await request(app.getHttpServer())
      .get(`/api/admin/reports.xlsx?month=2026-07&userId=${employee.userId}`)
      .set('Cookie', admin.cookie)
      .expect(
        'Content-Type',
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      .expect(
        'Content-Disposition',
        /attachment; filename="overtime-2607\.xlsx"; filename\*=UTF-8''/,
      )
      .expect(200);
    const excelBody: unknown = excel.body;
    expect(Buffer.isBuffer(excelBody)).toBe(true);
    if (!Buffer.isBuffer(excelBody)) {
      throw new Error('Excel response did not contain a workbook buffer');
    }
    expect(excelBody.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get('/api/admin/reports?month=2026-13')
      .set('Cookie', admin.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/admin/reports?month=2026-07&userId=not-a-uuid')
      .set('Cookie', admin.cookie)
      .expect(400);
  });
});
