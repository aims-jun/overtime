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
  @PrimaryColumn('uuid')
  id!: string;

  @Column('text', { name: 'google_subject' })
  googleSubject!: string;

  @Column('text')
  email!: string;

  @Column('text')
  name!: string;

  @Column('text', { name: 'profile_image_url', nullable: true })
  profileImageUrl!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'last_login_at' })
  lastLoginAt!: Date;
}
