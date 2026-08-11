import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

describe('ReportsController', () => {
  it('returns an Excel attachment with the company filename', async () => {
    const buffer = Buffer.from('excel workbook');
    const excelMock = jest.fn().mockResolvedValue({
      buffer,
      fileName: '연장 근무 이력_IT개발팀_2607.xlsx',
      asciiFileName: 'overtime-2607.xlsx',
    });
    const reports = { excel: excelMock } as unknown as ReportsService;
    const controller = new ReportsController(reports);
    const setHeaderMock = jest.fn();
    const response = { setHeader: setHeaderMock } as unknown as Response;

    const result = await controller.excel(
      '2026-07',
      '11111111-1111-4111-8111-111111111111',
      response,
    );

    expect(excelMock).toHaveBeenCalledWith({
      month: '2026-07',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="overtime-2607.xlsx"; filename*=UTF-8''${encodeURIComponent(
        '연장 근무 이력_IT개발팀_2607.xlsx',
      )}`,
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
