import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('sessions')
@Index('idx_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('idx_sessions_expires_at', ['expiresAt'])
export class SessionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('text', { name: 'token_hash' })
  tokenHash!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
