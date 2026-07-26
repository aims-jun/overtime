import { AddOvertimeOverlapConstraint1753500000000 } from './0002-add-overtime-overlap-constraint';

describe('AddOvertimeOverlapConstraint1753500000000', () => {
  it('creates the user time-range exclusion constraint', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((query: string) => {
        queries.push(query);
        return Promise.resolve();
      }),
    };

    await new AddOvertimeOverlapConstraint1753500000000().up(
      queryRunner as never,
    );

    expect(queries[0]).toBe('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(queries[1]).toContain('EXCLUDE USING gist');
    expect(queries[1]).toContain('user_id WITH =');
    expect(queries[1]).toContain("tstzrange(start_at, end_at, '[)') WITH &&");
  });

  it('removes the exclusion constraint on rollback', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddOvertimeOverlapConstraint1753500000000().down(
      queryRunner as never,
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE overtime_records DROP CONSTRAINT ex_overtime_records_no_overlap',
    );
  });
});
