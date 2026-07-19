import { createTypeOrmOptions } from './typeorm.config';

describe('createTypeOrmOptions', () => {
  it('creates PostgreSQL options with automatic schema changes disabled', () => {
    const databaseUrl =
      'postgresql://overtime_app:test@127.0.0.1:55432/overtime_test';

    const options = createTypeOrmOptions(databaseUrl);

    expect(options).toMatchObject({
      type: 'postgres',
      url: databaseUrl,
      synchronize: false,
      migrationsRun: false,
      extra: { max: 10 },
    });
  });
});
