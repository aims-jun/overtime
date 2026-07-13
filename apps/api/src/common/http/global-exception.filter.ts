import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationError } from '../errors/application.error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? 'unknown';

    if (exception instanceof ApplicationError) {
      response.status(exception.status).json({
        code: exception.code,
        message: exception.message,
        ...(exception.fieldErrors
          ? { fieldErrors: exception.fieldErrors }
          : {}),
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (
        status === 503 &&
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'status' in exceptionResponse &&
        exceptionResponse.status === 'unavailable' &&
        'database' in exceptionResponse &&
        exceptionResponse.database === 'unavailable'
      ) {
        response.status(status).json(exceptionResponse);
        return;
      }
      const code =
        {
          400: 'BAD_REQUEST',
          401: 'UNAUTHORIZED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
        }[status] ?? 'HTTP_ERROR';
      const message =
        {
          400: '입력값을 확인해주세요',
          401: '로그인이 필요합니다',
          403: '접근 권한이 없습니다',
          404: '요청한 정보를 찾을 수 없습니다',
        }[status] ?? '요청을 처리할 수 없습니다';

      response.status(status).json({ code, message, requestId });
      return;
    }

    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '서버 오류가 발생했습니다',
      requestId,
    });
  }
}
