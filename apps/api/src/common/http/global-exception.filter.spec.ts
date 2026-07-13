import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ApplicationError } from '../errors/application.error';
import { GlobalExceptionFilter } from './global-exception.filter';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { requestId: 'request-1' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('GlobalExceptionFilter', () => {
  it('hides unexpected exception details and includes the request id', () => {
    const { host, response } = createHost();

    new GlobalExceptionFilter().catch(new Error('database path /secret'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: '서버 오류가 발생했습니다',
      requestId: 'request-1',
    });
  });

  it('maps a known application error without losing field errors', () => {
    const { host, response } = createHost();
    const error = new ApplicationError(
      'OVERTIME_OVERLAP',
      409,
      '기존 야근 기록과 시간이 겹칩니다',
      { startTime: '시간을 확인해주세요' },
    );

    new GlobalExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: 'OVERTIME_OVERLAP',
      message: '기존 야근 기록과 시간이 겹칩니다',
      fieldErrors: { startTime: '시간을 확인해주세요' },
      requestId: 'request-1',
    });
  });

  it('maps Nest validation failures to a safe bad request response', () => {
    const { host, response } = createHost();

    new GlobalExceptionFilter().catch(
      new BadRequestException(['workDate must be a valid date']),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 'BAD_REQUEST',
      message: '입력값을 확인해주세요',
      requestId: 'request-1',
    });
  });
});
