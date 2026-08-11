import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { AdminGuard } from '../common/admin.guard';
import type {
  AdminUserView,
  MonthlyAdminReport,
  MonthlyReportQuery,
} from './reports.service';
import { ReportsService } from './reports.service';

@Controller('api/admin')
@UseGuards(SessionGuard, AdminGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('users')
  users(): Promise<AdminUserView[]> {
    return this.reports.listUsers();
  }

  @Get('reports')
  monthly(
    @Query('month') month: string,
    @Query('userId') userId?: string,
  ): Promise<MonthlyAdminReport> {
    return this.reports.monthly({ month, userId });
  }

  @Get('reports.xlsx')
  async excel(
    @Query('month') month: string,
    @Query('userId') userId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const query: MonthlyReportQuery = { month, userId };
    const { buffer, fileName, asciiFileName } = await this.reports.excel(query);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(buffer);
  }
}
