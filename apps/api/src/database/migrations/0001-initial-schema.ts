import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1752360000000 implements MigrationInterface {
  name = 'InitialSchema1752360000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        googleSubject text NOT NULL,
        email text NOT NULL,
        name text NOT NULL,
        profileImageUrl text,
        createdAt datetime NOT NULL DEFAULT (datetime('now')),
        lastLoginAt datetime NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_users_google_subject ON users (googleSubject)',
    );

    await queryRunner.query(`
      CREATE TABLE sessions (
        id text PRIMARY KEY NOT NULL,
        tokenHash text NOT NULL,
        userId text NOT NULL,
        expiresAt datetime NOT NULL,
        createdAt datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT fk_sessions_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (tokenHash)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_sessions_expires_at ON sessions (expiresAt)',
    );

    await queryRunner.query(`
      CREATE TABLE overtime_records (
        id text PRIMARY KEY NOT NULL,
        userId text NOT NULL,
        workDate text NOT NULL,
        startAt datetime NOT NULL,
        endAt datetime NOT NULL,
        durationMinutes integer NOT NULL,
        reason text NOT NULL,
        createdAt datetime NOT NULL DEFAULT (datetime('now')),
        updatedAt datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT fk_overtime_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_overtime_user_work_date ON overtime_records (userId, workDate)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE overtime_records');
    await queryRunner.query('DROP TABLE sessions');
    await queryRunner.query('DROP TABLE users');
  }
}
