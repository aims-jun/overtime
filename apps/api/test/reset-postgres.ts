import { DataSource } from 'typeorm';
import { createTypeOrmOptions } from '../src/database/typeorm.config';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = new DataSource(
    createTypeOrmOptions(process.env.DATABASE_URL as string),
  );
  await dataSource.initialize();
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE sessions, overtime_records, users CASCADE;',
  );
});

afterAll(async () => {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
});
