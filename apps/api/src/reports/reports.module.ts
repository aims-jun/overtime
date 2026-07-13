import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../common/admin.guard';
import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { TypeOrmReportsRepository } from './typeorm-reports.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([UserEntity, OvertimeRecordEntity]),
  ],
  controllers: [ReportsController],
  providers: [
    AdminGuard,
    ReportsService,
    { provide: ReportsRepository, useClass: TypeOrmReportsRepository },
  ],
})
export class ReportsModule {}
