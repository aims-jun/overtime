import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('does not expose database driver details when readiness fails', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('secret sqlite path')),
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    await expect(service.readiness()).rejects.toMatchObject<
      Partial<ServiceUnavailableException>
    >({
      response: { status: 'unavailable', database: 'unavailable' },
    });
  });
});
