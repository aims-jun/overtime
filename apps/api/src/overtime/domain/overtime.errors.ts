import { ApplicationError } from '../../common/errors/application.error';

export class InvalidOvertimeTimeError extends ApplicationError {
  constructor() {
    super(
      'INVALID_OVERTIME_TIME',
      400,
      '야근 날짜와 시작·종료 시각을 확인해주세요',
    );
  }
}
