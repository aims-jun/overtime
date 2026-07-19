import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1752360000000 implements MigrationInterface {
  name = 'InitialSchema1752360000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        google_subject text NOT NULL,
        email text NOT NULL,
        name text NOT NULL,
        profile_image_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_users_google_subject ON users (google_subject)',
    );

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY,
        token_hash text NOT NULL,
        user_id uuid NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (token_hash)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_sessions_expires_at ON sessions (expires_at)',
    );

    await queryRunner.query(`
      CREATE TABLE overtime_records (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        work_date date NOT NULL,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        duration_minutes integer NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_overtime_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT chk_overtime_duration_positive
          CHECK (duration_minutes > 0),
        CONSTRAINT chk_overtime_time_order CHECK (end_at > start_at)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_overtime_user_work_date ON overtime_records (user_id, work_date)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE overtime_records');
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE users');
  }
}
