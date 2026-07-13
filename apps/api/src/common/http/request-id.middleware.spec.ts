import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('preserves a safe incoming request id and returns it in the response', () => {
    const request = {
      header: jest.fn().mockReturnValue('client-request-123'),
    } as never;
    const response = {
      setHeader: jest.fn(),
      once: jest.fn(),
    } as never;
    const next = jest.fn();

    new RequestIdMiddleware().use(request, response, next);

    expect(request).toHaveProperty('requestId', 'client-request-123');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'client-request-123',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
