import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import type { NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AuthModule } from './auth/auth.module';
import { GlobalExceptionFilter } from './common/http/global-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { createAppConfigModule } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { OvertimeModule } from './overtime/overtime.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    createAppConfigModule(),
    DatabaseModule,
    AuthModule,
    OvertimeModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser(), RequestIdMiddleware).forRoutes('*');
  }
}
