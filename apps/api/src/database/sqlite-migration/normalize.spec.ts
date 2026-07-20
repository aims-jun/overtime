import { normalizeOvertimeRow, normalizeUserRow } from './normalize';

describe('SQLite migration normalization', () => {
  it('normalizes a user row with a nullable profile image', () => {
    expect(
      normalizeUserRow({
        id: '11111111-1111-4111-8111-111111111111',
        googleSubject: 'google-subject-1',
        email: 'person@example.com',
        name: '이지은',
        profileImageUrl: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        lastLoginAt: '2026-07-02T01:02:03.000Z',
      }),
    ).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      googleSubject: 'google-subject-1',
      email: 'person@example.com',
      name: '이지은',
      profileImageUrl: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      lastLoginAt: new Date('2026-07-02T01:02:03.000Z'),
    });
  });

  it('canonicalizes accepted UUIDs to lowercase', () => {
    expect(
      normalizeOvertimeRow({
        id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        userId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
        workDate: '2026-07-01',
        startAt: '2026-07-01T09:00:00.000Z',
        endAt: '2026-07-01T10:00:00.000Z',
        durationMinutes: 60,
        reason: 'case normalization',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
  });

  it('rejects an invalid UUID with only the row ID and failure kind', () => {
    expect(() =>
      normalizeUserRow({
        id: 'not-a-uuid',
        googleSubject: 'private-subject',
        email: 'private@example.com',
        name: 'Private Name',
        profileImageUrl: 'https://private.example/image.png',
        createdAt: '2026-07-01T00:00:00.000Z',
        lastLoginAt: '2026-07-02T01:02:03.000Z',
      }),
    ).toThrow('invalid UUID at users row not-a-uuid');
  });

  it('rejects an invalid timestamp without exposing personal fields', () => {
    let thrown: unknown;
    try {
      normalizeUserRow({
        id: '11111111-1111-4111-8111-111111111111',
        googleSubject: 'secret-subject',
        email: 'private@example.com',
        name: 'Private Name',
        profileImageUrl: 'https://private.example/image.png',
        createdAt: 'not-a-date',
        lastLoginAt: '2026-07-02T01:02:03.000Z',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      'invalid timestamp at users row 11111111-1111-4111-8111-111111111111',
    );
    expect((thrown as Error).message).not.toContain('private');
    expect((thrown as Error).message).not.toContain('secret');
  });

  it.each(['2026-7-01', '2026-02-30', '2026-07-01T00:00:00Z'])(
    'rejects invalid work date %s',
    (workDate) => {
      expect(() =>
        normalizeOvertimeRow({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          userId: '11111111-1111-4111-8111-111111111111',
          workDate,
          startAt: '2026-07-01T09:00:00.000Z',
          endAt: '2026-07-01T10:00:00.000Z',
          durationMinutes: 60,
          reason: '출시 준비',
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:00:00.000Z',
        }),
      ).toThrow(
        'invalid work date at overtime_records row aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    },
  );
});
