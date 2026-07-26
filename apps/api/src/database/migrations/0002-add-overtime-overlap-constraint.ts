import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOvertimeOverlapConstraint1753500000000 implements MigrationInterface {
  name = 'AddOvertimeOverlapConstraint1753500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await queryRunner.query(`
      ALTER TABLE overtime_records
      ADD CONSTRAINT ex_overtime_records_no_overlap
      EXCLUDE USING gist (
        user_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE overtime_records DROP CONSTRAINT ex_overtime_records_no_overlap',
    );
  }
}
