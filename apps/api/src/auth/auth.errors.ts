import { ApplicationError } from '../common/errors/application.error';

export class ForbiddenCompanyAccountError extends ApplicationError {
  constructor() {
    super(
      'FORBIDDEN_COMPANY_ACCOUNT',
      403,
      '회사 Google 계정으로 로그인해주세요',
    );
  }
}

export class InvalidGoogleCredentialError extends ApplicationError {
  constructor() {
    super(
      'INVALID_GOOGLE_CREDENTIAL',
      401,
      'Google 로그인을 다시 시도해주세요',
    );
  }
}

export class InvalidSessionError extends ApplicationError {
  constructor() {
    super('INVALID_SESSION', 401, '로그인이 필요합니다');
  }
}
