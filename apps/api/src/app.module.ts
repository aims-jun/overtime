import { MiddlewareConsumer, Module } from '@nestjs/common';
import type { NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { createAppConfigModule } from './config/app.config';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [createAppConfigModule(), DatabaseModule],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
