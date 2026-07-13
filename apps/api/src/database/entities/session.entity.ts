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
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  tokenHash!: string;

  @Column('text')
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column('datetime')
  expiresAt!: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
