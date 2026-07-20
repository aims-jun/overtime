import { runMigrations } from './run-migrations';

describe('runMigrations', () => {
  const databaseUrl =
    'postgresql://overtime_migration:test@127.0.0.1:55432/overtime_test';

  it('initializes, applies migrations, and destroys the data source in order', async () => {
    const calls: string[] = [];
    const fakeDataSource = {
      initialize: jest.fn(() => {
        calls.push('initialize');
        return Promise.resolve();
      }),
      runMigrations: jest.fn(() => {
        calls.push('runMigrations');
        return Promise.resolve([{ name: 'InitialSchema1752360000000' }]);
      }),
      destroy: jest.fn(() => {
        calls.push('destroy');
        return Promise.resolve();
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
      initialize: jest.fn(() => Promise.resolve()),
      runMigrations: jest.fn(() => Promise.reject(migrationError)),
      destroy: jest.fn(() => Promise.resolve()),
    };

    await expect(runMigrations(databaseUrl, () => fakeDataSource)).rejects.toBe(
      migrationError,
    );
    expect(fakeDataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
