import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from './health.service';
import { HealthService } from './health.service';

@Controller('api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  readiness(): Promise<HealthStatus> {
    return this.health.readiness();
  }
}
