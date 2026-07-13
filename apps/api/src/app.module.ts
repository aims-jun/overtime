import { MiddlewareConsumer, Module } from '@nestjs/common';
import type { NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { GlobalExceptionFilter } from './common/http/global-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { createAppConfigModule } from './config/app.config';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [createAppConfigModule(), DatabaseModule, AuthModule],
  controllers: [AppController],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser(), RequestIdMiddleware).forRoutes('*');
  }
}
