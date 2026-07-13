import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('users')
@Index('idx_users_google_subject', ['googleSubject'], { unique: true })
export class UserEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  googleSubject!: string;

  @Column('text')
  email!: string;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  profileImageUrl!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @Column('datetime')
  lastLoginAt!: Date;
}
