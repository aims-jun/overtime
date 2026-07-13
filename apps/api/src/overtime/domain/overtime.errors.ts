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

export class InvalidOvertimeInputError extends ApplicationError {
  constructor(message = '야근 입력값을 확인해주세요') {
    super('INVALID_OVERTIME_INPUT', 400, message);
  }
}

export class OvertimeNotFoundError extends ApplicationError {
  constructor() {
    super('OVERTIME_NOT_FOUND', 404, '야근 기록을 찾을 수 없습니다');
  }
}

export class OvertimeOverlapError extends ApplicationError {
  constructor() {
    super('OVERTIME_OVERLAP', 409, '기존 야근 기록과 시간이 겹칩니다');
  }
}
