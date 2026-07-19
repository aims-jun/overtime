import { runMigrations } from './run-migrations';

describe('runMigrations', () => {
  const databaseUrl =
    'postgresql://overtime_migration:test@127.0.0.1:55432/overtime_test';

  it('initializes, applies migrations, and destroys the data source in order', async () => {
    const calls: string[] = [];
    const fakeDataSource = {
      initialize: jest.fn(async () => {
        calls.push('initialize');
      }),
      runMigrations: jest.fn(async () => {
        calls.push('runMigrations');
        return [{ name: 'InitialSchema1752360000000' }];
      }),
      destroy: jest.fn(async () => {
        calls.push('destroy');
      }),
    };

    await expect(
      runMigrations(databaseUrl, () => fakeDataSource),
    ).resolves.toEqual(['InitialSchema1752360000000']);
    expect(calls).toEqual(['initialize', 'runMigrations', 'destroy']);
  });

  it('destroys the initialized data source when applying migrations fails', async () => {
    const migrationError = new Error('migration failed');
    const fakeDataSource = {
      initialize: jest.fn(async () => undefined),
      runMigrations: jest.fn(async () => Promise.reject(migrationError)),
      destroy: jest.fn(async () => undefined),
    };

    await expect(runMigrations(databaseUrl, () => fakeDataSource)).rejects.toBe(
      migrationError,
    );
    expect(fakeDataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
