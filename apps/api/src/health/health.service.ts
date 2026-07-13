import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type HealthStatus = { status: 'ok'; database: 'ready' };

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async readiness(): Promise<HealthStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'ready' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'unavailable',
      });
    }
  }
}
