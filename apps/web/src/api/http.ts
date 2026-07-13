export class SessionExpiredError extends Error {
  constructor() {
    super('로그인이 만료되었습니다')
    this.name = 'SessionExpiredError'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors?: Record<string, string>

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const fallback = { code: 'UNKNOWN', message: '요청을 처리하지 못했습니다' }
    const body = await response.json().catch(() => fallback)
    return new ApiError(
      response.status,
      typeof body.code === 'string' ? body.code : fallback.code,
      typeof body.message === 'string' ? body.message : fallback.message,
      body.fieldErrors,
    )
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (response.status === 401) throw new SessionExpiredError()
  if (!response.ok) throw await ApiError.fromResponse(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function friendlyError(error: unknown): string {
  if (error instanceof SessionExpiredError) return '로그인이 만료되었습니다'
  if (error instanceof ApiError && error.status < 500) return error.message
  return '잠시 후 다시 시도해주세요'
}
