import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OvertimeRecordEntity } from '../database/entities/overtime-record.entity';
import { OvertimeController } from './overtime.controller';
import { OvertimeRepository } from './overtime.repository';
import { OvertimeService } from './overtime.service';
import { TypeOrmOvertimeRepository } from './typeorm-overtime.repository';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([OvertimeRecordEntity])],
  controllers: [OvertimeController],
  providers: [
    OvertimeService,
    { provide: OvertimeRepository, useClass: TypeOrmOvertimeRepository },
  ],
  exports: [OvertimeService],
})
export class OvertimeModule {}
