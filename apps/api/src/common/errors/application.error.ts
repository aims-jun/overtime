export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
